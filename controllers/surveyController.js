// =========================================
// controllers/surveyController.js
// Logic for User Acquisition & Feedback
// =========================================

const db = require('../config/db');
const Logger = require('../utils/logger');
const ActivityLogger = require('../utils/activityLogger');

/**
 * Check if current user has already filled the surveys
 */
exports.getSurveyStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check Acquisition
    const [acquisition] = await db.query(
      'SELECT source FROM user_acquisition WHERE user_id = ?',
      [userId]
    );

    // Check Feedback (Count rows for history)
    const [feedbackRows] = await db.query(
      'SELECT COUNT(*) as count FROM user_feedback WHERE user_id = ?',
      [userId]
    );
    const feedbackCount = feedbackRows[0].count;

    res.json({
      success: true,
      data: {
        hasFilledAcquisition: acquisition.length > 0,
        hasFilledFeedback: feedbackCount > 0,
        feedbackCount: feedbackCount,
        acquisitionSource: acquisition.length > 0 ? acquisition[0].source : null
      }
    });

  } catch (error) {
    Logger.error('SURVEY_CONTROLLER', 'Error getting survey status', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil status survey' });
  }
};

/**
 * Submit User Acquisition Source
 */
exports.submitAcquisition = async (req, res) => {
  try {
    const userId = req.user.id;
    const { source } = req.body;

    if (!source) {
      return res.status(400).json({ success: false, message: 'Sumber informasi diperlukan' });
    }

    const validSources = ['Google', 'TikTok', 'Instagram', 'Facebook', 'Friend', 'Other'];
    if (!validSources.includes(source)) {
      return res.status(400).json({ success: false, message: 'Sumber informasi tidak valid' });
    }

    // Insert (Ignore if already exists due to UNIQUE constraint)
    await db.query(
      'INSERT INTO user_acquisition (user_id, source) VALUES (?, ?)',
      [userId, source]
    );

    // Activity Log
    await ActivityLogger.log(userId, 'SURVEY_ACQUISITION', `User selected source: ${source}`);

    res.json({ success: true, message: 'Terima kasih telah memberitahu kami!' });

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Anda sudah mengisi survey ini' });
    }
    Logger.error('SURVEY_CONTROLLER', 'Error submitting acquisition', error);
    res.status(500).json({ success: false, message: 'Gagal menyimpan data' });
  }
};

/**
 * Submit or Update User Feedback
 */
exports.submitFeedback = async (req, res) => {
  try {
    const userId = req.user.id;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating harus antara 1-5' });
    }

    // 1. Check current submission count by counting rows
    const [existing] = await db.query(
      'SELECT COUNT(*) as count FROM user_feedback WHERE user_id = ?',
      [userId]
    );

    const count = existing[0].count;
    if (count >= 3) {
      return res.status(400).json({ 
        success: false, 
        message: 'Anda telah mencapai batas maksimal pengiriman feedback (3 kali).' 
      });
    }

    // 2. Insert as a NEW record (History)
    await db.query(
      'INSERT INTO user_feedback (user_id, rating, comment) VALUES (?, ?, ?)',
      [userId, rating, comment || '']
    );

    // Activity Log
    await ActivityLogger.log(userId, 'SURVEY_FEEDBACK', `User submitted feedback #${count + 1} with rating: ${rating}`);

    res.json({ success: true, message: 'Feedback Anda sangat berharga bagi kami!' });

  } catch (error) {
    Logger.error('SURVEY_CONTROLLER', 'Error submitting feedback', error);
    res.status(500).json({ success: false, message: 'Gagal menyimpan feedback' });
  }
};



/**
 * Admin: Get Aggregated Acquisition Data
 */
exports.getAcquisitionStats = async (req, res) => {
  try {
    const query = `
      SELECT source, COUNT(*) as count 
      FROM user_acquisition 
      GROUP BY source
    `;
    const [rows] = await db.query(query);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    Logger.error('SURVEY_CONTROLLER', 'Error getting acquisition stats', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil data statistik' });
  }
};

/**
 * Admin: Get Feedback List
 */
exports.getFeedbackList = async (req, res) => {
  try {
    const query = `
      SELECT 
        f.id, f.user_id, f.rating, f.comment, f.admin_reply, f.admin_reply_at, f.is_hidden, f.updated_at,
        u.name as user_name, u.email as user_email, u.avatar_url
      FROM user_feedback f
      JOIN users u ON u.id = f.user_id
      ORDER BY f.updated_at DESC
    `;
    const [rows] = await db.query(query);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    Logger.error('SURVEY_CONTROLLER', 'Error getting feedback list', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil daftar feedback' });
  }
};

/**
 * Admin: Submit Reply to Feedback
 */
exports.submitReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;

    if (!reply) {
      return res.status(400).json({ success: false, message: 'Isi balasan diperlukan' });
    }

    await db.query(
      'UPDATE user_feedback SET admin_reply = ?, admin_reply_at = NOW() WHERE id = ?',
      [reply, id]
    );

    await ActivityLogger.log('SURVEY_REPLY_SUBMIT', { 
      admin_id: req.admin?.id, 
      feedback_id: id, 
      reply_text: reply 
    });

    res.json({ success: true, message: 'Balasan berhasil dikirim!' });

  } catch (error) {
    Logger.error('SURVEY_CONTROLLER', 'Error submitting reply', error);
    res.status(500).json({ success: false, message: 'Gagal mengirim balasan' });
  }
};

/**
 * Admin: Delete admin reply
 */
exports.deleteReply = async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      'UPDATE user_feedback SET admin_reply = NULL, admin_reply_at = NULL WHERE id = ?',
      [id]
    );

    await ActivityLogger.log('SURVEY_REPLY_DELETE', { 
      admin_id: req.admin?.id, 
      feedback_id: id 
    });

    res.json({ success: true, message: 'Balasan berhasil dihapus!' });
  } catch (error) {
    Logger.error('SURVEY_CONTROLLER', 'Error deleting reply', error);
    res.status(500).json({ success: false, message: 'Gagal menghapus balasan' });
  }
};

/**
 * Admin: Toggle feedback hidden status
 */
exports.toggleHideFeedback = async (req, res) => {
  try {
    const { id } = req.params;

    // Toggle logic: get current status first
    const [rows] = await db.query('SELECT is_hidden FROM user_feedback WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Feedback tidak ditemukan' });

    const newStatus = rows[0].is_hidden ? 0 : 1;

    await db.query(
      'UPDATE user_feedback SET is_hidden = ? WHERE id = ?',
      [newStatus, id]
    );

    await ActivityLogger.log('SURVEY_FEEDBACK_HIDE', { 
      admin_id: req.admin?.id, 
      feedback_id: id, 
      visibility: newStatus ? 'HIDDEN' : 'VISIBLE' 
    });

    res.json({ success: true, message: `Berhasil ${newStatus ? 'menyembunyikan' : 'menampilkan'} ulasan!`, is_hidden: newStatus });
  } catch (error) {
    Logger.error('SURVEY_CONTROLLER', 'Error toggling feedback hide', error);
    res.status(500).json({ success: false, message: 'Gagal mengubah vibilitas ulasan' });
  }
};

/**
 * Public: Get Feedback List for Home Page Showcase
 */
exports.getPublicFeedbacks = async (req, res) => {
  try {
    // Only show items that are NOT hidden
    const query = `
      SELECT 
        f.id, f.rating, f.comment, f.admin_reply, f.admin_reply_at, f.updated_at,
        u.name as user_name, u.avatar_url
      FROM user_feedback f
      JOIN users u ON u.id = f.user_id
      WHERE (f.comment IS NOT NULL AND f.comment != '') AND f.is_hidden = 0
      ORDER BY f.updated_at DESC
      LIMIT 50
    `;
    const [rows] = await db.query(query);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    Logger.error('SURVEY_CONTROLLER', 'Error fetching public feedbacks', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil ulasan' });
  }
};

/**
 * Admin: Get list of OTPs for manual support
 */
exports.getOTPList = async (req, res) => {
  try {
    const { search = '', type = '', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        ov.id, ov.otp_code, ov.type, ov.is_used, ov.expired_at, ov.created_at,
        u.name as user_name, u.email as user_email, u.phone as user_phone
      FROM otp_verifications ov
      JOIN users u ON u.id = ov.user_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR ov.otp_code LIKE ?)`;
      const searchVal = `%${search}%`;
      params.push(searchVal, searchVal, searchVal, searchVal);
    }

    if (type) {
      query += ` AND ov.type = ?`;
      params.push(type);
    }

    // Count total for pagination
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as countTable`;
    const [countRows] = await db.query(countQuery, params);
    const total = countRows[0].total;

    // Final query with pagination
    query += ` ORDER BY ov.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await db.query(query, params);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    Logger.error('SURVEY_CONTROLLER', 'Error fetching OTP list', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil data OTP' });
  }
};



