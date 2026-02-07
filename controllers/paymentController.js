// =========================================
// FILE: controllers/paymentController.js - OPIMIZED (ACID Transactions)
// Enhanced with WhatsApp Notifications & Logging
// =========================================

const PDFDocument = require('pdfkit');
const db = require('../config/db');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const Logger = require('../utils/logger');
const whatsappClient = require('../utils/whatsappClient');
const { WhatsAppTemplates, formatCurrency, formatDate } = require('../utils/whatsappTemplates');

const StorageService = require('../services/storageService');
const upload = multer({ storage: StorageService.getStorageEngine() });

/**
 * CREATE PAYMENT (Transactional)
 * POST /api/payment/create
 */
exports.create = async (req, res) => {
  let connection;
  try {
    const { package_id, method, forceUpgrade } = req.body;
    const userId = req.user.id;

    if (!package_id || !method) {
      Logger.payment('CREATE_FAILED', 'Missing data', { userId });
      return res.status(400).json({
        success: false,
        message: 'Package ID dan metode diperlukan'
      });
    }

    Logger.payment('CREATE_ATTEMPT', `User: ${userId}, Package: ${package_id}, Method: ${method}`);

    // Get connection and start transaction
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Check active tokens
    const [activeTokens] = await connection.query(
      `SELECT ut.id AS token_id, ut.package_id, pk.name AS package_name
       FROM user_tokens ut
       JOIN packages pk ON pk.id = ut.package_id
       WHERE ut.user_id = ? AND ut.is_active = 1 FOR UPDATE`, // Lock rows
      [userId]
    );

    // Has active package and not confirmed upgrade
    if (activeTokens.length > 0 && !forceUpgrade) {
      await connection.commit(); // Commit read-only logic
      Logger.payment('CREATE_WARNING', 'User has active package', { userId, currentPackage: activeTokens[0].package_name });

      return res.json({
        success: false,
        hasActive: true,
        currentPackage: {
          token_id: activeTokens[0].token_id,
          package_id: activeTokens[0].package_id,
          package_name: activeTokens[0].package_name
        },
        warning: "PENTING: Jika Anda melakukan upgrade paket ini, maka paket sebelumnya akan dihapus."
      });
    }

    // If confirmed upgrade, deactivate old packages
    if (activeTokens.length > 0 && forceUpgrade) {
      await connection.query(
        'UPDATE user_tokens SET is_active=0 WHERE user_id=? AND is_active=1',
        [userId]
      );
      Logger.payment('DEACTIVATE_OLD', `Old packages deactivated for user ${userId}`);
    }

    // Create payment
    const [result] = await connection.query(
      `INSERT INTO payments (user_id, package_id, payment_method, amount, status)
       SELECT ?, id, ?, price, 'pending'
       FROM packages WHERE id=?`,
      [userId, method, package_id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      Logger.payment('CREATE_FAILED', 'Invalid package', { package_id });
      return res.status(400).json({
        success: false,
        message: 'Invalid package atau gagal membuat payment'
      });
    }

    const paymentId = result.insertId;

    await connection.commit();
    Logger.payment('CREATE_SUCCESS', `Payment created: ${paymentId}`, { userId, package_id });

    res.json({
      success: true,
      message: 'Payment berhasil dibuat, silakan upload bukti',
      payment_id: paymentId
    });

  } catch (error) {
    if (connection) await connection.rollback();
    Logger.error('PAYMENT', 'Create payment error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * CONFIRM PAYMENT (Transactional)
 * POST /api/payment/confirm
 */
exports.confirm = [
  upload.single('proof'),
  async (req, res) => {
    let connection;
    try {
      const userId = req.user.id;
      const { payment_id, email, phone } = req.body;

      if (!req.file) {
        Logger.payment('CONFIRM_FAILED', 'No proof file', { userId, payment_id });
        return res.status(400).json({
          success: false,
          message: 'Bukti pembayaran wajib diupload'
        });
      }

      if (!payment_id || !email || !phone) {
        Logger.payment('CONFIRM_FAILED', 'Missing data', { userId });
        return res.status(400).json({
          success: false,
          message: 'payment_id, email, dan phone wajib diisi'
        });
      }

      Logger.payment('CONFIRM_ATTEMPT', `User: ${userId}, Payment: ${payment_id}`);

      connection = await db.getConnection();
      await connection.beginTransaction();

      // Validate payment
      const [payments] = await connection.query(
        `SELECT p.id, p.package_id, p.amount, pk.name as package_name
         FROM payments p
         JOIN packages pk ON pk.id = p.package_id
         WHERE p.id=? AND p.user_id=? AND p.status="pending" FOR UPDATE`,
        [payment_id, userId]
      );

      if (payments.length === 0) {
        await connection.rollback();
        Logger.payment('CONFIRM_FAILED', 'Payment not found', { payment_id });
        return res.status(404).json({
          success: false,
          message: 'Payment tidak ditemukan atau sudah diproses'
        });
      }

      const payment = payments[0];

      // Save confirmation
      await connection.query(
        `INSERT INTO payment_confirmations (payment_id, email, phone, proof_image, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [payment_id, email, phone, req.file.filename]
      );

      await connection.commit();
      Logger.payment('CONFIRM_SUCCESS', `Payment confirmed: ${payment_id}`, { userId });

      // Send WhatsApp notification (Async - Outside Transaction)
      try {
        if (whatsappClient.isReady) {
          const [users] = await db.query(
            'SELECT name, phone FROM users WHERE id = ?',
            [userId]
          );

          if (users.length > 0) {
            const user = users[0];
            const message = WhatsAppTemplates.paymentReceived(
              user.name,
              payment.package_name,
              payment.amount,
              payment_id
            );

            // Fire and forget
            whatsappClient.sendMessage(user.phone, message).catch(err =>
              Logger.error('WHATSAPP', 'Failed async send', err)
            );

            Logger.whatsapp('PAYMENT_RECEIVED', `Notification queued for ${user.phone}`, { userId, payment_id });
          }
        }
      } catch (error) {
        // Don't fail the request if WhatsApp fails
        Logger.error('WHATSAPP', 'WhatsApp logic error', error);
      }

      res.json({
        success: true,
        message: 'Bukti berhasil dikirim, menunggu approval admin'
      });

    } catch (error) {
      if (connection) await connection.rollback();
      Logger.error('PAYMENT', 'Confirm payment error', error);
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server'
      });
    } finally {
      if (connection) connection.release();
    }
  }
];

/**
 * CHECK ACTIVE PACKAGE (Read-Only)
 * GET /api/payment/check-active-package
 */
exports.checkActivePackage = async (req, res) => {
  try {
    const userId = req.user.id;

    // Read queries don't necessarily need strict transaction isolation if we accept slightly stale data,
    // but using pool directly is fine.
    const [rows] = await db.query(
      `SELECT ut.id AS token_id, ut.package_id, pk.name AS package_name,
              ut.activated_at, ut.expired_at
       FROM user_tokens ut
       JOIN packages pk ON pk.id = ut.package_id
       WHERE ut.user_id = ? AND ut.is_active = 1`,
      [userId]
    );

    if (rows.length > 0) {
      return res.json({
        success: true,
        hasActive: true,
        activePackage: {
          token_id: rows[0].token_id,
          package_id: rows[0].package_id,
          package_name: rows[0].package_name,
          activated_at: rows[0].activated_at,
          expired_at: rows[0].expired_at
        },
        warning: "PENTING: Jika Anda melakukan upgrade paket ini, maka paket sebelumnya akan dihapus."
      });
    }

    res.json({
      success: true,
      hasActive: false
    });

  } catch (error) {
    Logger.error('PAYMENT', 'Check active package error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * GET USER PAYMENTS (Read-Only)
 * GET /api/payment/user/payments
 */
exports.getUserPayments = async (req, res) => {
  try {
    const userId = req.user.id;

    const [results] = await db.query(
      `SELECT p.id, p.package_id, pk.name AS package_name, p.payment_method,
              p.amount, p.status, p.created_at, p.updated_at
       FROM payments p
       JOIN packages pk ON pk.id = p.package_id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    Logger.error('PAYMENT', 'Get user payments error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * DOWNLOAD INVOICE (Read-Only)
 * GET /api/payment/:paymentId/invoice
 */
exports.getInvoice = async (req, res) => {
  try {
    const paymentId = req.params.paymentId;
    const userId = req.user.id;

    const [rows] = await db.query(
      `SELECT p.id, p.package_id, pk.name AS package_name, p.amount,
              p.status, p.created_at
       FROM payments p
       JOIN packages pk ON pk.id = p.package_id
       WHERE p.id = ? AND p.user_id = ?`,
      [paymentId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    const payment = rows[0];

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${paymentId}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    const leftMargin = 80;

    // Header - Try/Catch image loading to prevent crash
    try {
      doc.image(path.join(__dirname, '..', 'invoice', 'NS_blank_02.png'), leftMargin, 20, { width: 120 });
    } catch (e) {
      // Ignore image error
    }

    doc.fontSize(22).fillColor('#1f2937').text('Invoice Pembayaran', 0, 30, { align: 'right' });
    doc.moveDown(2);

    doc.moveTo(leftMargin, 120).lineTo(550, 120).strokeColor('#e5e7eb').stroke();

    // Info
    doc.fontSize(12).fillColor('#374151');
    doc.text(`Invoice ID   : ${payment.id}`, leftMargin, 140);
    doc.text(`Tanggal      : ${new Date(payment.created_at).toLocaleDateString('id-ID')}`, leftMargin);
    doc.text(`Status       : ${payment.status.trim() === 'confirmed' ? '✓ Terverifikasi' : payment.status.trim()}`, leftMargin);
    doc.text(`Paket        : ${payment.package_name}`, leftMargin);
    doc.text(`Jumlah Bayar : Rp ${payment.amount.toLocaleString('id-ID')}`, leftMargin);

    doc.moveDown(1);
    doc.moveTo(leftMargin, doc.y).lineTo(550, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(1);

    // Footer
    doc.fontSize(12).fillColor('#1f2937').text('Terima kasih telah menggunakan layanan kami.', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(10).fillColor('#6b7280');
    doc.text('Jika ada pertanyaan terkait pembayaran, silakan hubungi support kami.', { align: 'center' });
    doc.text('Email: cs@nuansasolution.id | Telp: 0896-4444-8721', { align: 'center' });

    doc.end();

    Logger.payment('INVOICE_DOWNLOADED', `Invoice downloaded: ${paymentId}`, { userId });

  } catch (error) {
    Logger.error('PAYMENT', 'Get invoice error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * ADMIN ACTIVATE PAYMENT (Transactional)
 * POST /api/payment/admin/activate
 */
exports.adminActivatePayment = async (req, res) => {
  let connection;
  try {
    const { paymentId } = req.body;

    if (!paymentId) {
      Logger.payment('ACTIVATE_FAILED', 'Missing paymentId');
      return res.status(400).json({
        success: false,
        message: 'Payment ID diperlukan'
      });
    }

    Logger.payment('ACTIVATE_ATTEMPT', `Payment: ${paymentId}`);

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Check payment status with lock
    const [payments] = await connection.query(
      `SELECT p.id, p.user_id, p.package_id, p.status, pk.name as package_name, pk.duration_days
       FROM payments p
       JOIN packages pk ON pk.id = p.package_id
       WHERE p.id=? FOR UPDATE`,
      [paymentId]
    );

    if (payments.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Payment tidak ditemukan' });
    }

    const payment = payments[0];

    if (payment.status === 'confirmed') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Payment sudah dikonfirmasi sebelumnya' });
    }

    // Update payment status
    await connection.query(
      'UPDATE payments SET status="confirmed", updated_at=NOW() WHERE id=?',
      [paymentId]
    );

    // Deactivate old tokens
    await connection.query(
      'UPDATE user_tokens SET is_active=0 WHERE user_id=? AND is_active=1',
      [payment.user_id]
    );

    // Create new token
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + payment.duration_days);

    await connection.query(
      `INSERT INTO user_tokens
       (user_id, package_id, token, activated_at, expired_at, is_active, is_trial)
       VALUES (?, ?, ?, NOW(), ?, 1, 0)`,
      [payment.user_id, payment.package_id, crypto.randomUUID(), expiryDate]
    );

    await connection.commit();
    Logger.payment('ACTIVATE_SUCCESS', `Package activated: ${paymentId}`, {
      userId: payment.user_id,
      packageId: payment.package_id
    });

    // Send WhatsApp notification (Async)
    try {
      if (whatsappClient.isReady) {
        const [users] = await db.query(
          'SELECT name, phone FROM users WHERE id = ?',
          [payment.user_id]
        );

        if (users.length > 0) {
          const user = users[0];
          const expiryDateStr = formatDate(expiryDate);

          const message = WhatsAppTemplates.paymentApproved(
            user.name,
            payment.package_name,
            payment.duration_days,
            expiryDateStr
          );

          whatsappClient.sendMessage(user.phone, message).catch(err =>
            Logger.error('WHATSAPP', 'Failed async send', err)
          );

          Logger.whatsapp('PAYMENT_APPROVED', `Notification queued for ${user.phone}`, {
            userId: payment.user_id,
            paymentId
          });
        }
      }
    } catch (error) {
      Logger.error('WHATSAPP', 'WhatsApp logic error', error);
    }

    res.json({
      success: true,
      message: 'Payment approved & package activated successfully'
    });

  } catch (error) {
    if (connection) await connection.rollback();
    Logger.error('PAYMENT', 'Admin activate payment error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  } finally {
    if (connection) connection.release();
  }
};

exports.uploadMiddleware = upload;