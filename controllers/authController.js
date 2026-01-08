// =========================================
// FILE: controllers/authController.js
// UPDATED - With WhatsApp OTP Integration
// =========================================

const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateOtp } = require('../utils/otp');
const { v4: uuid } = require('uuid');
const whatsappClient = require('../utils/whatsappClient');

/**
 * REGISTER (Updated with WhatsApp OTP)
 */
exports.register = async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !phone || !password) {
    return res.status(400).json({ 
      success: false,
      message: 'Data tidak lengkap' 
    });
  }

  // Validate phone number format (basic)
  const phoneRegex = /^(\+62|62|0)[0-9]{9,12}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({
      success: false,
      message: 'Format nomor telepon tidak valid. Gunakan format: 08xxx atau +628xxx'
    });
  }

  const hash = bcrypt.hashSync(password, 10);

  db.query(
    'INSERT INTO users (name,email,phone,password) VALUES (?,?,?,?)',
    [name, email, phone, hash],
    async (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ 
            success: false,
            message: 'Email sudah terdaftar' 
          });
        }
        return res.status(500).json({
          success: false,
          message: 'Database error',
          error: err
        });
      }

      const userId = result.insertId;
      const otp = generateOtp();

      // Save OTP to database
      db.query(
        `INSERT INTO otp_verifications 
         (user_id, otp_code, expired_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
        [userId, otp],
        async (otpErr) => {
          if (otpErr) {
            console.error('Error saving OTP:', otpErr);
          }

          // Try to send OTP via WhatsApp
          let whatsappSent = false;
          let whatsappError = null;

          try {
            if (whatsappClient.isReady) {
              await whatsappClient.sendOTP(phone, otp, name);
              whatsappSent = true;
              console.log(`✅ WhatsApp OTP sent to ${phone}`);
            } else {
              whatsappError = 'WhatsApp bot is not connected';
              console.log(`⚠️ WhatsApp not ready, OTP: ${otp}`);
            }
          } catch (waError) {
            whatsappError = waError.message;
            console.error('❌ WhatsApp send error:', waError.message);
          }

          // Create trial package
          db.query(
            `SELECT id, duration_days 
             FROM packages 
             WHERE is_trial = 1 AND is_active = 1 
             LIMIT 1`,
            (err, rows) => {
              if (!err && rows.length) {
                const trial = rows[0];
                db.query(
                  `INSERT INTO user_tokens
                   (user_id, package_id, token, activated_at, expired_at, is_active, is_trial)
                   VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 1, 1)`,
                  [userId, trial.id, uuid(), trial.duration_days]
                );
              }
            }
          );

          // Send response
          if (whatsappSent) {
            res.json({
              success: true,
              message: 'Registrasi berhasil! Kode OTP telah dikirim ke WhatsApp Anda.',
              otpSent: true,
              viaWhatsApp: true
            });
          } else {
            // If WhatsApp fails, still allow registration but inform user
            res.json({
              success: true,
              message: 'Registrasi berhasil! OTP: ' + otp + ' (WhatsApp tidak tersedia)',
              otpSent: false,
              viaWhatsApp: false,
              whatsappError: whatsappError,
              otp: otp // Only for development/testing
            });
          }
        }
      );
    }
  );
};

/**
 * VERIFY OTP
 */
exports.verifyOtp = (req, res) => {
  const { email, otp } = req.body;

  db.query(
    `SELECT o.id, o.user_id
     FROM otp_verifications o
     JOIN users u ON u.id = o.user_id
     WHERE u.email = ?
       AND o.otp_code = ?
       AND o.is_used = 0
       AND o.expired_at > NOW()`,
    [email, otp],
    (err, rows) => {
      if (err || !rows.length) {
        return res.status(400).json({ 
          success: false,
          message: 'OTP tidak valid atau sudah kadaluarsa' 
        });
      }

      const data = rows[0];

      db.query('UPDATE otp_verifications SET is_used = 1 WHERE id = ?', [data.id]);
      db.query('UPDATE users SET is_verified = 1 WHERE id = ?', [data.user_id]);

      res.json({ 
        success: true,
        message: 'OTP berhasil diverifikasi' 
      });
    }
  );
};

/**
 * RESEND OTP (New)
 */
exports.resendOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email diperlukan'
    });
  }

  db.query(
    'SELECT id, name, phone, is_verified FROM users WHERE email = ?',
    [email],
    async (err, rows) => {
      if (err || !rows.length) {
        return res.status(404).json({
          success: false,
          message: 'User tidak ditemukan'
        });
      }

      const user = rows[0];

      if (user.is_verified) {
        return res.status(400).json({
          success: false,
          message: 'User sudah terverifikasi'
        });
      }

      // Generate new OTP
      const otp = generateOtp();

      // Invalidate old OTPs
      db.query(
        'UPDATE otp_verifications SET is_used = 1 WHERE user_id = ? AND is_used = 0',
        [user.id]
      );

      // Insert new OTP
      db.query(
        `INSERT INTO otp_verifications 
         (user_id, otp_code, expired_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
        [user.id, otp],
        async (otpErr) => {
          if (otpErr) {
            return res.status(500).json({
              success: false,
              message: 'Gagal membuat OTP baru'
            });
          }

          // Try to send via WhatsApp
          let whatsappSent = false;
          let whatsappError = null;

          try {
            if (whatsappClient.isReady) {
              await whatsappClient.sendOTP(user.phone, otp, user.name);
              whatsappSent = true;
              console.log(`✅ Resent WhatsApp OTP to ${user.phone}`);
            } else {
              whatsappError = 'WhatsApp bot is not connected';
              console.log(`⚠️ WhatsApp not ready, OTP: ${otp}`);
            }
          } catch (waError) {
            whatsappError = waError.message;
            console.error('❌ WhatsApp send error:', waError.message);
          }

          if (whatsappSent) {
            res.json({
              success: true,
              message: 'OTP baru telah dikirim ke WhatsApp Anda',
              otpSent: true,
              viaWhatsApp: true
            });
          } else {
            res.json({
              success: true,
              message: 'OTP baru: ' + otp + ' (WhatsApp tidak tersedia)',
              otpSent: false,
              viaWhatsApp: false,
              whatsappError: whatsappError,
              otp: otp // Only for development
            });
          }
        }
      );
    }
  );
};

/**
 * LOGIN
 */
exports.login = (req, res) => {
  const { email, password } = req.body;

  db.query(
    'SELECT * FROM users WHERE email = ?',
    [email],
    (err, rows) => {
      if (err || !rows.length) {
        return res.status(404).json({ 
          success: false,
          message: 'User tidak ditemukan' 
        });
      }

      const user = rows[0];

      if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ 
          success: false,
          message: 'Password salah' 
        });
      }

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: 'user'
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({ 
        success: true,
        token 
      });
    }
  );
};

/**
 * ME
 */
exports.me = (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ 
      success: false,
      message: 'Token missing' 
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    db.query(
      'SELECT id, name, email, phone, is_verified FROM users WHERE id = ?',
      [decoded.id],
      (err, rows) => {
        if (err || !rows.length) {
          return res.status(404).json({ 
            success: false,
            message: 'User not found' 
          });
        }
        res.json({
          success: true,
          user: rows[0]
        });
      }
    );
  } catch {
    res.status(401).json({ 
      success: false,
      message: 'Invalid token' 
    });
  }
};