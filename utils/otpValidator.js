// =========================================
// FILE: utils/otpValidator.js - NEW
// Strict OTP Validation
// =========================================

const db = require('../config/db');
const Logger = require('./logger');

const OTPValidator = {
  /**
   * Generate OTP (6 digits)
   */
  generateOTP: () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  /**
   * Create OTP with stricter rules
   */
  createOTP: async (userId, type = 'verify') => {
    try {
      // Invalidate old OTPs
      await db.query(
        'UPDATE otp_verifications SET is_used = 1 WHERE user_id = ? AND type = ? AND is_used = 0',
        [userId, type]
      );

      const otp = OTPValidator.generateOTP();
      const expiredAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      await db.query(
        `INSERT INTO otp_verifications (user_id, otp_code, expired_at, type, is_used)
         VALUES (?, ?, ?, ?, 0)`,
        [userId, otp, expiredAt, type]
      );

      Logger.auth('OTP_CREATED', `OTP created for user ${userId}, type: ${type}`);

      return { otp, expiredAt };
    } catch (error) {
      Logger.error('OTP', 'Failed to create OTP', error);
      throw error;
    }
  },

  /**
   * Verify OTP with strict validation
   */
  verifyOTP: async (userId, otp, type = 'verify') => {
    try {
      const [rows] = await db.query(
        `SELECT id, expired_at, is_used
         FROM otp_verifications
         WHERE user_id = ? AND otp_code = ? AND type = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, otp, type]
      );

      if (rows.length === 0) {
        Logger.auth('OTP_INVALID', `Invalid OTP for user ${userId}`);
        return { valid: false, message: 'OTP tidak valid' };
      }

      const otpRecord = rows[0];

      // Check if already used
      if (otpRecord.is_used === 1) {
        Logger.auth('OTP_USED', `OTP already used for user ${userId}`);
        return { valid: false, message: 'OTP sudah digunakan' };
      }

      // Check if expired
      if (new Date(otpRecord.expired_at) < new Date()) {
        Logger.auth('OTP_EXPIRED', `OTP expired for user ${userId}`);
        return { valid: false, message: 'OTP sudah kadaluarsa' };
      }

      // Mark as used
      await db.query(
        'UPDATE otp_verifications SET is_used = 1 WHERE id = ?',
        [otpRecord.id]
      );

      Logger.auth('OTP_VERIFIED', `OTP verified for user ${userId}`);

      return { valid: true, message: 'OTP berhasil diverifikasi' };
    } catch (error) {
      Logger.error('OTP', 'Failed to verify OTP', error);
      throw error;
    }
  },

  /**
   * Check OTP rate limit (max 5 attempts per 15 minutes)
   */
  checkRateLimit: async (userId) => {
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      const [rows] = await db.query(
        `SELECT COUNT(*) as count
         FROM otp_verifications
         WHERE user_id = ? AND created_at > ?`,
        [userId, fifteenMinutesAgo]
      );

      const count = rows[0].count;

      if (count >= 5) {
        Logger.auth('OTP_RATE_LIMIT', `Rate limit exceeded for user ${userId}`);
        return {
          limited: true,
          message: 'Terlalu banyak permintaan. Coba lagi dalam 15 menit.'
        };
      }

      return { limited: false };
    } catch (error) {
      Logger.error('OTP', 'Failed to check rate limit', error);
      throw error;
    }
  }
};

module.exports = OTPValidator;