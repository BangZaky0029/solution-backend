// =========================================
// FILE: controllers/adminController.js - UPDATED
// Enhanced with Logging & Notifications
// =========================================

const db = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const Logger = require('../utils/logger');
const whatsappClient = require('../utils/whatsappClient');
const { WhatsAppTemplates, formatDate } = require('../utils/whatsappTemplates');

/**
 * ADMIN LOGIN
 * POST /api/admin/login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      Logger.auth('ADMIN_LOGIN_FAILED', 'Missing credentials');
      return res.status(400).json({
        success: false,
        message: 'Email dan password diperlukan'
      });
    }

    Logger.auth('ADMIN_LOGIN_ATTEMPT', `Email: ${email}`);

    const [rows] = await db.query(
      'SELECT * FROM admins WHERE email=?',
      [email]
    );

    if (rows.length === 0) {
      Logger.auth('ADMIN_LOGIN_FAILED', 'Admin not found', { email });
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    const admin = rows[0];

    if (!bcrypt.compareSync(password, admin.password)) {
      Logger.auth('ADMIN_LOGIN_FAILED', 'Wrong password', { adminId: admin.id });
      return res.status(401).json({
        success: false,
        message: 'Wrong password'
      });
    }

    const token = jwt.sign(
      { id: admin.id, role: 'admin' },
      process.env.JWT_SECRET
    );

    Logger.auth('ADMIN_LOGIN_SUCCESS', `Admin logged in: ${admin.id}`);

    res.json({
      success: true,
      token
    });

  } catch (error) {
    Logger.error('ADMIN', 'Login error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * GET PENDING PAYMENTS
 * GET /api/admin/payments
 */
exports.payments = async (req, res) => {
  try {
    Logger.info('ADMIN', 'Fetching pending payments');

    const [rows] = await db.query(
      `SELECT
        p.id,
        p.id as payment_id,
        COALESCE(pc.email, u.email) as email,
        COALESCE(pc.phone, u.phone) as phone,
        pc.proof_image,
        p.created_at,
        p.status,
        p.amount,
        pk.name as package_name,
        u.name as user_name
       FROM payments p
       LEFT JOIN packages pk ON pk.id = p.package_id
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN payment_confirmations pc ON pc.payment_id = p.id
       WHERE p.status = 'pending'
       ORDER BY p.created_at DESC`
    );

    Logger.info('ADMIN', `Found ${rows.length} pending payments`);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    Logger.error('ADMIN', 'Get payments error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * ACTIVATE PACKAGE
 * POST /api/admin/activate
 */
exports.activate = async (req, res) => {
  try {
    const { payment_id } = req.body;

    if (!payment_id) {
      Logger.payment('ACTIVATE_FAILED', 'Missing payment_id');
      return res.status(400).json({
        success: false,
        message: 'Payment ID diperlukan'
      });
    }

    Logger.payment('ACTIVATE_ATTEMPT', `Admin activating payment: ${payment_id}`);

    const [rows] = await db.query(
      `SELECT p.*, pk.duration_days, pk.name as package_name, u.name as user_name, u.phone
       FROM payments p
       JOIN packages pk ON pk.id=p.package_id
       JOIN users u ON u.id=p.user_id
       WHERE p.id=?`,
      [payment_id]
    );

    if (rows.length === 0) {
      Logger.payment('ACTIVATE_FAILED', 'Payment not found', { payment_id });
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    const payment = rows[0];

    if (payment.status === 'confirmed') {
      Logger.payment('ACTIVATE_WARNING', 'Payment already confirmed', { payment_id });
      return res.status(400).json({
        success: false,
        message: 'Already activated'
      });
    }

    const token = uuid();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + payment.duration_days);

    // Deactivate old tokens
    await db.query(
      'UPDATE user_tokens SET is_active=0 WHERE user_id=? AND is_active=1',
      [payment.user_id]
    );

    // Insert new token
    await db.query(
      `INSERT INTO user_tokens (user_id, package_id, token, activated_at, expired_at)
       VALUES (?, ?, ?, NOW(), ?)`,
      [payment.user_id, payment.package_id, token, expiryDate]
    );

    // Update payment status
    await db.query(
      `UPDATE payments SET status='confirmed', updated_at=NOW() WHERE id=?`,
      [payment_id]
    );

    Logger.payment('ACTIVATE_SUCCESS', `Package activated by admin: ${payment_id}`, {
      userId: payment.user_id,
      packageId: payment.package_id
    });

    // Send WhatsApp notification
    try {
      if (whatsappClient.isReady) {
        const expiryDateStr = formatDate(expiryDate);
        const message = WhatsAppTemplates.paymentApproved(
          payment.user_name,
          payment.package_name,
          payment.duration_days,
          expiryDateStr
        );

        await whatsappClient.sendMessage(payment.phone, message);

        Logger.whatsapp('PAYMENT_APPROVED', `Notification sent to ${payment.phone}`, {
          userId: payment.user_id,
          paymentId: payment_id
        });
      }
    } catch (error) {
      Logger.error('WHATSAPP', 'Failed to send payment approved notification', error);
    }

    res.json({
      success: true,
      message: 'Package activated',
      token
    });

  } catch (error) {
    Logger.error('ADMIN', 'Activate error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};