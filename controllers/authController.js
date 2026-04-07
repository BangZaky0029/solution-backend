// C:\codingVibes\nuansasolution\.mainweb\payments\solution-backend\controllers\authController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const Logger = require('../utils/logger');
const ActivityLogger = require('../utils/activityLogger');
const OTPValidator = require('../utils/otpValidator');
const PhoneValidator = require('../utils/phoneValidator');
const waGateway = require('../utils/whatsappGateway');

/**
 * REGISTER - OTP ditampilkan di frontend (NO WHATSAPP)
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Validation
    if (!name || !email || !phone || !password) {
      Logger.auth('REGISTER_FAILED', 'Missing required fields', { email, phone });
      return res.status(400).json({
        success: false,
        message: 'Data tidak lengkap'
      });
    }

    // 🔥 VALIDATE PHONE FORMAT
    const phoneValidation = PhoneValidator.validate(phone);
    if (!phoneValidation.valid) {
      Logger.auth('REGISTER_FAILED', 'Invalid phone format', { phone });
      return res.status(400).json({
        success: false,
        message: phoneValidation.message
      });
    }

    const normalizedPhone = phoneValidation.normalized;

    Logger.auth('REGISTER_ATTEMPT', `Email: ${email}, Phone: ${normalizedPhone}`);

    // ✅ CHECK: Email already exists
    const [existingEmail] = await db.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingEmail.length > 0) {
      Logger.auth('REGISTER_FAILED', 'Email already exists', { email });
      return res.status(400).json({
        success: false,
        message: 'Email sudah terdaftar'
      });
    }

    // ✅ CHECK: Phone already exists
    const [existingPhone] = await db.query(
      'SELECT id, name FROM users WHERE phone = ?',
      [normalizedPhone]
    );

    if (existingPhone.length > 0) {
      Logger.auth('REGISTER_FAILED', 'Phone already registered', { phone: normalizedPhone });
      return res.status(400).json({
        success: false,
        message: 'Nomor WhatsApp sudah terdaftar. Silakan gunakan nomor lain.'
      });
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Insert user
    const [result] = await db.query(
      'INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)',
      [name, email, normalizedPhone, hashedPassword]
    );

    const userId = result.insertId;

    Logger.auth('REGISTER_SUCCESS', `User created: ${userId}`, { email, phone: normalizedPhone });

    // Check rate limit
    const rateLimit = await OTPValidator.checkRateLimit(userId);
    if (rateLimit.limited) {
      return res.status(429).json({
        success: false,
        message: rateLimit.message
      });
    }

    // 🔥 Generate OTP (30 detik expiry)
    const { otp, expiredAt } = await OTPValidator.createOTP(userId, 'verify');

    Logger.auth('OTP_GENERATED', `OTP for user ${userId}: ${otp}`, { expiredAt });

    // Create trial package
    const [trialPackages] = await db.query(
      'SELECT id, duration_days, name FROM packages WHERE is_trial = 1 AND is_active = 1 LIMIT 1'
    );

    if (trialPackages.length > 0) {
      // 🔥 ANTI-ABUSE CHECK
      // Check if user (phone/email) has deleted account AND used trial before
      const [history] = await db.query(
        `SELECT id FROM deleted_users_history 
         WHERE (phone = ? OR email = ?) AND has_used_trial = 1 LIMIT 1`,
        [normalizedPhone, email]
      );

      if (history.length > 0) {
        Logger.info('TRIAL_SKIPPED', `Trial DENIED for user ${userId} (Abuse Prevention - Previous Account Found)`);
      } else {
        const trial = trialPackages[0];

        await db.query(
          `INSERT INTO user_tokens
           (user_id, package_id, token, activated_at, expired_at, is_active, is_trial)
           VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 1, 1)`,
          [userId, trial.id, uuid(), trial.duration_days]
        );

        Logger.info('TRIAL', `Trial package activated for user ${userId}`, { packageName: trial.name });
      }
    }

    // 🔥 Send OTP via WhatsApp Gateway
    let whatsappSent = false;
    try {
      const connected = await waGateway.isConnected();
      if (connected) {
        await waGateway.sendOTP(normalizedPhone, name, otp, 'register');
        whatsappSent = true;
        Logger.whatsapp('REGISTER_OTP', `OTP sent to ${normalizedPhone}`);
      }
    } catch (waError) {
      Logger.error('WHATSAPP', 'Failed to send registration OTP', waError);
    }

    // Determine trial response data
    let trialResponse = null;
    let trialStatus = 'unavailable';

    if (trialPackages.length > 0) {
      const trial = trialPackages[0];
      // Re-query/re-check if we actually inserted (based on history check above)
      // Since we didn't store the result of the check in a variable accessible here easily without refactoring,
      // let's assume we need to return what happened. 

      // Refactoring slightly to use a flag for trial granted
      // We need to move the check logic up or use a variable. 
      // Let's rely on the fact we already checked history.

      // Re-running safe check for response construction:
      const [historyCheck] = await db.query(
        `SELECT id FROM deleted_users_history 
         WHERE (phone = ? OR email = ?) AND has_used_trial = 1 LIMIT 1`,
        [normalizedPhone, email]
      );

      if (historyCheck.length > 0) {
        trialStatus = 'denied'; // Was available but denied due to abuse
      } else {
        trialStatus = 'granted';
        trialResponse = {
          packageName: trial.name,
          durationDays: trial.duration_days
        };
      }
    }

    const responseData = {
      success: true,
      message: whatsappSent
        ? 'Registrasi berhasil! Kode OTP telah dikirim ke WhatsApp Anda.'
        : 'Registrasi berhasil! Silakan verifikasi OTP.',
      otpSent: whatsappSent,
      // Only return OTP in response if WhatsApp failed (development fallback)
      ...((!whatsappSent || process.env.NODE_ENV === 'development') && { otp }),
      otpExpiry: expiredAt,
      otpDuration: 300, // 5 minutes
      user: {
        email,
        name,
        phone: PhoneValidator.formatDisplay(normalizedPhone)
      },
      trialPackage: trialResponse, // Only present if granted
      trialStatus: trialStatus // 'granted', 'denied', 'unavailable'
    };

    // Log activity (Centralized: Handles Firebase, Sheets, and WhatsApp)
    ActivityLogger.log('REGISTER', {
      user_id: userId || null,
      name,
      email,
      phone: PhoneValidator.formatDisplay(normalizedPhone),
      trial_status: trialStatus,
      is_verified: 0 // New users are not verified yet
    }).catch(console.error);

    return res.status(200).json(responseData);

  } catch (error) {
    Logger.error('AUTH', 'Register error', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * VERIFY OTP - No WhatsApp
 * POST /api/auth/verify-otp
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email dan OTP diperlukan'
      });
    }

    Logger.auth('VERIFY_OTP_ATTEMPT', `Email: ${email}`);

    // Find user
    const [users] = await db.query(
      'SELECT id, name, phone FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      Logger.auth('VERIFY_OTP_FAILED', 'User not found', { email });
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      });
    }

    const user = users[0];

    // Verify OTP
    const verification = await OTPValidator.verifyOTP(user.id, otp, 'verify');

    if (!verification.valid) {
      Logger.auth('VERIFY_OTP_FAILED', verification.message, { userId: user.id });
      return res.status(400).json({
        success: false,
        message: verification.message
      });
    }

    // Update user as verified
    await db.query(
      'UPDATE users SET is_verified = 1 WHERE id = ?',
      [user.id]
    );

    Logger.auth('VERIFY_OTP_SUCCESS', `User verified: ${user.id}`);

    return res.status(200).json({
      success: true,
      message: 'OTP berhasil diverifikasi! Silakan login.'
    });

  } catch (error) {
    Logger.error('AUTH', 'Verify OTP error', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * RESEND OTP - No WhatsApp
 * POST /api/auth/resend-otp
 */
exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email diperlukan'
      });
    }

    Logger.auth('RESEND_OTP_ATTEMPT', `Email: ${email}`);

    const [users] = await db.query(
      'SELECT id, name, phone, is_verified FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      Logger.auth('RESEND_OTP_FAILED', 'User not found', { email });
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      });
    }

    const user = users[0];

    if (user.is_verified) {
      return res.status(400).json({
        success: false,
        message: 'User sudah terverifikasi'
      });
    }

    // Check rate limit
    const rateLimit = await OTPValidator.checkRateLimit(user.id);
    if (rateLimit.limited) {
      return res.status(429).json({
        success: false,
        message: rateLimit.message
      });
    }

    // Generate new OTP
    const { otp, expiredAt } = await OTPValidator.createOTP(user.id, 'verify');
    Logger.auth('RESEND_OTP_SUCCESS', `New OTP for user ${user.id}: ${otp}`);

    // 🔥 Send OTP via WhatsApp Gateway
    let whatsappSent = false;
    try {
      const connected = await waGateway.isConnected();
      if (connected) {
        await waGateway.sendOTP(user.phone, user.name, otp, 'register');
        whatsappSent = true;
        Logger.whatsapp('RESEND_OTP', `OTP resent to ${user.phone}`);
      }
    } catch (waError) {
      Logger.error('WHATSAPP', 'Failed to resend OTP', waError);
    }

    const responseData = {
      success: true,
      message: whatsappSent
        ? 'Kode OTP baru telah dikirim ke WhatsApp Anda'
        : 'OTP baru telah dibuat',
      otpSent: whatsappSent,
      ...((!whatsappSent || process.env.NODE_ENV === 'development') && { otp }),
      otpExpiry: expiredAt,
      otpDuration: 300
    };

    return res.status(200).json(responseData);

  } catch (error) {
    Logger.error('AUTH', 'Resend OTP error', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * LOGIN - No WhatsApp
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email dan password diperlukan'
      });
    }

    Logger.auth('LOGIN_ATTEMPT', `Email: ${email}`);

    const [users] = await db.query(
      'SELECT id, name, email, phone, password, is_verified FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      Logger.auth('LOGIN_FAILED', 'User not found', { email });
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      });
    }

    const user = users[0];

    if (!bcrypt.compareSync(password, user.password)) {
      Logger.auth('LOGIN_FAILED', 'Wrong password', { userId: user.id });
      return res.status(401).json({
        success: false,
        message: 'Password salah'
      });
    }

    // Generate token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: 'user'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    Logger.auth('LOGIN_SUCCESS', `User logged in: ${user.id}`);

    // Update login stats in MySQL
    await db.query(
      'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = ?',
      [user.id]
    );

    // Log activity (Centralized: Handles Firebase, Sheets, and WhatsApp)
    ActivityLogger.log('LOGIN', {
      user_id: user.id,
      name: user.name,
      email: user.email,
      is_verified: user.is_verified
    }).catch(console.error);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: PhoneValidator.formatDisplay(user.phone),
        isVerified: user.is_verified
      }
    });

  } catch (error) {
    Logger.error('AUTH', 'Login error', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * ME
 * GET /api/auth/me
 */
exports.me = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Token missing'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [users] = await db.query(
      'SELECT id, name, email, phone, is_verified FROM users WHERE id = ?',
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = users[0];

    return res.status(200).json({
      success: true,
      user: {
        ...user,
        phoneFormatted: PhoneValidator.formatDisplay(user.phone)
      }
    });

  } catch (error) {
    Logger.error('AUTH', 'Get user error', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

/**
 * REQUEST DELETE OTP
 * POST /api/auth/request-delete-otp
 */
exports.requestDeleteOTP = async (req, res) => {
  try {
    const userId = req.user.id; // From middleware

    const [users] = await db.query(
      'SELECT id, name, phone FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }

    const user = users[0];

    // Generate OTP
    const { otp, expiredAt } = await OTPValidator.createOTP(userId, 'delete_account');
    Logger.auth('DELETE_OTP_REQ', `Delete OTP requested for user ${userId}`);

    // Send via WhatsApp
    let whatsappSent = false;
    try {
      const connected = await waGateway.isConnected();
      if (connected) {
        await waGateway.sendOTP(user.phone, user.name, otp, 'delete_account');
        whatsappSent = true;
      }
    } catch (waError) {
      Logger.error('WHATSAPP', 'Failed to send delete OTP', waError);
    }

    // Return response
    return res.status(200).json({
      success: true,
      message: whatsappSent
        ? 'Kode konfirmasi penghapusan akun telah dikirim ke WhatsApp.'
        : 'Gagal mengirim kode ke WhatsApp. Silakan coba lagi.',
      otpSent: whatsappSent
      // No dev OTP fallback for safety
    });

  } catch (error) {
    Logger.error('AUTH', 'Request delete OTP error', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
};

/**
 * DELETE ACCOUNT PERMANENTLY
 * POST /api/auth/delete-account
 */
exports.deleteAccount = async (req, res) => {
  let connection;
  try {
    const userId = req.user.id; // From middleware
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, message: 'OTP diperlukan' });
    }

    Logger.auth('DELETE_ACCOUNT_ATTEMPT', `User: ${userId}`);

    // Verify OTP
    const verification = await OTPValidator.verifyOTP(userId, otp, 'delete_account');
    if (!verification.valid) {
      return res.status(400).json({ success: false, message: verification.message });
    }

    // START TRANSACTION
    connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Log to deleted_users_history (Anti-Abuse)
      // Check if user has used trial
      const [tokens] = await connection.query(
        'SELECT id FROM user_tokens WHERE user_id = ? AND is_trial = 1 LIMIT 1',
        [userId]
      );
      const hasUsedTrial = tokens.length > 0 ? 1 : 0;

      // Get user info before delete
      const [userInfo] = await connection.query(
        'SELECT name, email, phone FROM users WHERE id = ?',
        [userId]
      );

      if (userInfo.length > 0) {
        const u = userInfo[0];
        await connection.query(
          `INSERT INTO deleted_users_history (original_user_id, name, email, phone, has_used_trial, deleted_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [userId, u.name, u.email, u.phone, hasUsedTrial]
        );
      }

      // 2. Delete OTP Verifications
      await connection.query('DELETE FROM otp_verifications WHERE user_id = ?', [userId]);

      // 3. Delete Payment Confirmations (via Payments)
      const [payments] = await connection.query('SELECT id FROM payments WHERE user_id = ?', [userId]);
      const paymentIds = payments.map(p => p.id);

      if (paymentIds.length > 0) {
        await connection.query(
          `DELETE FROM payment_confirmations WHERE payment_id IN (?)`,
          [paymentIds]
        );
      }

      // 4. Delete Payments
      await connection.query('DELETE FROM payments WHERE user_id = ?', [userId]);

      // 5. Delete User Tokens (Packages)
      await connection.query('DELETE FROM user_tokens WHERE user_id = ?', [userId]);

      // 6. Delete User
      await connection.query('DELETE FROM users WHERE id = ?', [userId]);

      await connection.commit();
      Logger.auth('DELETE_ACCOUNT_SUCCESS', `User deleted permanently: ${userId}`);

      return res.status(200).json({
        success: true,
        message: 'Akun Anda berhasil dihapus selamanya.'
      });

    } catch (dbError) {
      await connection.rollback();
      throw dbError;
    }

  } catch (error) {
    Logger.error('AUTH', 'Delete account error', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus akun'
    });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * LOGOUT
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
  try {
    const { id, name, email } = req.user;

    Logger.auth('LOGOUT', `User logged out: ${id}`);

    // Log activity (Sheets only, per user feedback) - Centralized
    const ActivityLogger = require('../utils/activityLogger');
    ActivityLogger.log('LOGOUT', {
      user_id: id,
      name: name,
      email: email,
      status: 'LOGOUT_SUCCESS'
    }, false).catch(console.error);

    return res.status(200).json({
      success: true,
      message: 'Logout berhasil'
    });
  } catch (error) {
    Logger.error('AUTH', 'Logout error', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal logout'
    });
  }
};