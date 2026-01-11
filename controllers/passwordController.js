// =========================================
// FILE: controllers/passwordController.js - NEW
// Forgot Password Controller
// =========================================

const db = require('../config/db');
const bcrypt = require('bcryptjs');
const Logger = require('../utils/logger');
const OTPValidator = require('../utils/otpValidator');
const whatsappClient = require('../utils/whatsappClient');
const { WhatsAppTemplates } = require('../utils/whatsappTemplates');

/**
 * REQUEST PASSWORD RESET
 * POST /api/password/forgot
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Nomor WhatsApp diperlukan'
      });
    }

    Logger.auth('FORGOT_PASSWORD_REQUEST', `Request from phone: ${phone}`);

    // Find user by phone
    const [users] = await db.query(
      'SELECT id, name, phone FROM users WHERE phone = ?',
      [phone]
    );

    if (users.length === 0) {
      Logger.auth('FORGOT_PASSWORD_NOT_FOUND', `Phone not found: ${phone}`);
      return res.status(404).json({
        success: false,
        message: 'Nomor WhatsApp tidak terdaftar'
      });
    }

    const user = users[0];

    // Check rate limit
    const rateLimit = await OTPValidator.checkRateLimit(user.id);
    if (rateLimit.limited) {
      return res.status(429).json({
        success: false,
        message: rateLimit.message
      });
    }

    // Generate OTP
    const { otp } = await OTPValidator.createOTP(user.id, 'reset');

    // Send OTP via WhatsApp
    let whatsappSent = false;
    try {
      if (whatsappClient.isReady) {
        const message = WhatsAppTemplates.forgotPasswordOTP(user.name, otp);
        await whatsappClient.sendMessage(user.phone, message);
        whatsappSent = true;

        Logger.whatsapp('FORGOT_PASSWORD_OTP', `OTP sent to ${user.phone}`);
      }
    } catch (error) {
      Logger.error('WHATSAPP', 'Failed to send forgot password OTP', error);
    }

    res.json({
      success: true,
      message: whatsappSent
        ? 'Kode OTP telah dikirim ke WhatsApp Anda'
        : `Kode OTP: ${otp} (WhatsApp tidak tersedia)`,
      otpSent: whatsappSent,
      // Only for development
      ...(process.env.NODE_ENV === 'development' && { otp })
    });

  } catch (error) {
    Logger.error('PASSWORD', 'Forgot password error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * VERIFY RESET OTP
 * POST /api/password/verify-reset-otp
 */
exports.verifyResetOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Nomor WhatsApp dan OTP diperlukan'
      });
    }

    Logger.auth('VERIFY_RESET_OTP', `Phone: ${phone}, OTP: ${otp}`);

    // Find user
    const [users] = await db.query(
      'SELECT id FROM users WHERE phone = ?',
      [phone]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nomor tidak ditemukan'
      });
    }

    const user = users[0];

    // Verify OTP
    const verification = await OTPValidator.verifyOTP(user.id, otp, 'reset');

    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.message
      });
    }

    res.json({
      success: true,
      message: 'OTP berhasil diverifikasi',
      userId: user.id
    });

  } catch (error) {
    Logger.error('PASSWORD', 'Verify reset OTP error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * RESET PASSWORD
 * POST /api/password/reset
 */
exports.resetPassword = async (req, res) => {
  try {
    const { phone, newPassword } = req.body;

    if (!phone || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Nomor WhatsApp dan password baru diperlukan'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password minimal 8 karakter'
      });
    }

    Logger.auth('RESET_PASSWORD', `Phone: ${phone}`);

    // Find user
    const [users] = await db.query(
      'SELECT id, name FROM users WHERE phone = ?',
      [phone]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nomor tidak ditemukan'
      });
    }

    const user = users[0];

    // Hash new password
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    // Update password
    await db.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, user.id]
    );

    // Send notification
    try {
      if (whatsappClient.isReady) {
        const time = new Date().toLocaleString('id-ID');
        const message = WhatsAppTemplates.passwordChanged(user.name, time);
        await whatsappClient.sendMessage(phone, message);

        Logger.whatsapp('PASSWORD_CHANGED', `Notification sent to ${phone}`);
      }
    } catch (error) {
      Logger.error('WHATSAPP', 'Failed to send password changed notification', error);
    }

    Logger.auth('PASSWORD_RESET_SUCCESS', `Password reset for user ${user.id}`);

    res.json({
      success: true,
      message: 'Password berhasil diubah'
    });

  } catch (error) {
    Logger.error('PASSWORD', 'Reset password error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * RESEND RESET OTP
 * POST /api/password/resend-otp
 */
exports.resendResetOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Nomor WhatsApp diperlukan'
      });
    }

    Logger.auth('RESEND_RESET_OTP', `Phone: ${phone}`);

    // Find user
    const [users] = await db.query(
      'SELECT id, name FROM users WHERE phone = ?',
      [phone]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nomor tidak ditemukan'
      });
    }

    const user = users[0];

    // Check rate limit
    const rateLimit = await OTPValidator.checkRateLimit(user.id);
    if (rateLimit.limited) {
      return res.status(429).json({
        success: false,
        message: rateLimit.message
      });
    }

    // Generate new OTP
    const { otp } = await OTPValidator.createOTP(user.id, 'reset');

    // Send via WhatsApp
    let whatsappSent = false;
    try {
      if (whatsappClient.isReady) {
        const message = WhatsAppTemplates.forgotPasswordOTP(user.name, otp);
        await whatsappClient.sendMessage(phone, message);
        whatsappSent = true;

        Logger.whatsapp('RESEND_RESET_OTP', `OTP resent to ${phone}`);
      }
    } catch (error) {
      Logger.error('WHATSAPP', 'Failed to resend reset OTP', error);
    }

    res.json({
      success: true,
      message: whatsappSent
        ? 'Kode OTP baru telah dikirim'
        : `Kode OTP baru: ${otp}`,
      otpSent: whatsappSent,
      ...(process.env.NODE_ENV === 'development' && { otp })
    });

  } catch (error) {
    Logger.error('PASSWORD', 'Resend reset OTP error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};