// controllers/authController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const Logger = require('../utils/logger');
const OTPValidator = require('../utils/otpValidator');
const whatsappClient = require('../utils/whatsappClient');
const { WhatsAppTemplates } = require('../utils/whatsappTemplates');
const PhoneValidator = require('../utils/phoneValidator');

/**
 * REGISTER
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

    // 🔥 CHECK: WhatsApp number is valid and registered on WhatsApp
    try {
      const isRegistered = await whatsappClient.checkNumberRegistered(normalizedPhone);
      if (!isRegistered) {
        Logger.auth('REGISTER_FAILED', 'WhatsApp number not registered', { phone: normalizedPhone });
        return res.status(400).json({
          success: false,
          message: 'Nomor WhatsApp tidak terdaftar di WhatsApp. Pastikan nomor Anda aktif.'
        });
      }
    } catch (error) {
      Logger.error('WHATSAPP', 'Failed to check WhatsApp registration', error);
      // Continue if check fails - don't block registration
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Insert user with normalized phone
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

    // Generate OTP
    const { otp } = await OTPValidator.createOTP(userId, 'verify');

    // 🔥 Send OTP via WhatsApp
    let whatsappSent = false;
    let whatsappError = null;

    try {
      if (whatsappClient.isReady) {
        const message = WhatsAppTemplates.registrationOTP(name, otp);
        await whatsappClient.sendMessage(normalizedPhone, message);
        whatsappSent = true;

        Logger.whatsapp('REGISTRATION_OTP', `OTP sent to ${normalizedPhone}`, { userId, otp });
      } else {
        whatsappError = 'WhatsApp bot is not connected';
        Logger.whatsapp('OTP_FAILED', 'WhatsApp not ready', { phone: normalizedPhone });
      }
    } catch (error) {
      whatsappError = error.message;
      Logger.error('WHATSAPP', 'Failed to send registration OTP', error);
    }

    // Create trial package
    const [trialPackages] = await db.query(
      'SELECT id, duration_days, name FROM packages WHERE is_trial = 1 AND is_active = 1 LIMIT 1'
    );

    if (trialPackages.length > 0) {
      const trial = trialPackages[0];
      
      await db.query(
        `INSERT INTO user_tokens
         (user_id, package_id, token, activated_at, expired_at, is_active, is_trial)
         VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 1, 1)`,
        [userId, trial.id, uuid(), trial.duration_days]
      );

      Logger.info('TRIAL', `Trial package activated for user ${userId}`, { packageName: trial.name });
    }

    // Response
    res.json({
      success: true,
      message: whatsappSent
        ? 'Registrasi berhasil! Kode OTP telah dikirim ke WhatsApp Anda.'
        : `Registrasi berhasil! Kode OTP: ${otp}. (WhatsApp error: ${whatsappError})`,
      otpSent: whatsappSent,
      viaWhatsApp: whatsappSent,
      whatsappError: whatsappError,
      phone: PhoneValidator.formatDisplay(normalizedPhone),
      // Only in development
      ...(process.env.NODE_ENV === 'development' && { otp })
    });

  } catch (error) {
    Logger.error('AUTH', 'Register error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * VERIFY OTP
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

    // 🔥 Send welcome message
    try {
      if (whatsappClient.isReady) {
        // Get trial package name
        const [tokens] = await db.query(
          `SELECT p.name 
           FROM user_tokens ut
           JOIN packages p ON p.id = ut.package_id
           WHERE ut.user_id = ? AND ut.is_trial = 1 AND ut.is_active = 1
           LIMIT 1`,
          [user.id]
        );

        const packageName = tokens.length > 0 ? tokens[0].name : 'Trial 3 Hari';
        const message = WhatsAppTemplates.welcome(user.name, packageName);
        
        await whatsappClient.sendMessage(user.phone, message);

        Logger.whatsapp('WELCOME', `Welcome message sent to ${user.phone}`, { userId: user.id });
      }
    } catch (error) {
      Logger.error('WHATSAPP', 'Failed to send welcome message', error);
    }

    res.json({
      success: true,
      message: 'OTP berhasil diverifikasi'
    });

  } catch (error) {
    Logger.error('AUTH', 'Verify OTP error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * RESEND OTP
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
    const { otp } = await OTPValidator.createOTP(user.id, 'verify');

    // 🔥 Send via WhatsApp
    let whatsappSent = false;
    let whatsappError = null;

    try {
      if (whatsappClient.isReady) {
        const message = WhatsAppTemplates.registrationOTP(user.name, otp);
        await whatsappClient.sendMessage(user.phone, message);
        whatsappSent = true;

        Logger.whatsapp('RESEND_OTP', `OTP resent to ${user.phone}`, { userId: user.id, otp });
      } else {
        whatsappError = 'WhatsApp bot is not connected';
        Logger.whatsapp('RESEND_OTP_FAILED', 'WhatsApp not ready');
      }
    } catch (error) {
      whatsappError = error.message;
      Logger.error('WHATSAPP', 'Failed to resend OTP', error);
    }

    res.json({
      success: true,
      message: whatsappSent
        ? 'OTP baru telah dikirim ke WhatsApp Anda'
        : `OTP baru: ${otp}. (WhatsApp error: ${whatsappError})`,
      otpSent: whatsappSent,
      viaWhatsApp: whatsappSent,
      whatsappError: whatsappError,
      ...(process.env.NODE_ENV === 'development' && { otp })
    });

  } catch (error) {
    Logger.error('AUTH', 'Resend OTP error', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
};

/**
 * LOGIN
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

    // 🔥 Send login alert
    try {
      if (whatsappClient.isReady && user.is_verified) {
        const time = new Date().toLocaleString('id-ID', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        const message = WhatsAppTemplates.loginAlert(user.name, time);
        
        await whatsappClient.sendMessage(user.phone, message);

        Logger.whatsapp('LOGIN_ALERT', `Alert sent to ${user.phone}`, { userId: user.id });
      }
    } catch (error) {
      Logger.error('WHATSAPP', 'Failed to send login alert', error);
    }

    res.json({
      success: true,
      token
    });

  } catch (error) {
    Logger.error('AUTH', 'Login error', error);
    res.status(500).json({
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

    res.json({
      success: true,
      user: {
        ...user,
        phoneFormatted: PhoneValidator.formatDisplay(user.phone)
      }
    });

  } catch (error) {
    Logger.error('AUTH', 'Get user error', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};