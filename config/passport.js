// C:\codingVibes\nuansasolution\.mainweb\payments\solution-backend\config\passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./db');
const { v4: uuid } = require('uuid');
const Logger = require('../utils/logger');

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "https://nuansasolution.id/auth/google/callback",
      proxy: true
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const googleId = profile.id;
        const name = profile.displayName;
        const avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

        Logger.auth('GOOGLE_OAUTH_CALLBACK', `Attempt for email: ${email}`);

        // 1. Cek apakah user dengan google_id sudah ada?
        const [usersById] = await db.query('SELECT * FROM users WHERE google_id = ?', [googleId]);
        
        if (usersById.length > 0) {
          Logger.auth('GOOGLE_OAUTH_SUCCESS', `Existing user found by ID: ${usersById[0].id}`);
          return done(null, usersById[0]);
        }

        // 2. Cek apakah email sudah ada di database (user pendaftar manual sebelumnya)
        const [usersByEmail] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        if (usersByEmail.length > 0) {
          // Link akun google ke user yang sudah ada
          await db.query(
            'UPDATE users SET google_id = ?, avatar_url = ?, is_verified = 1 WHERE id = ?',
            [googleId, avatarUrl, usersByEmail[0].id]
          );
          Logger.auth('GOOGLE_OAUTH_LINKED', `Linked Google ID to existing email: ${email}`);
          
          // Ambil data terbaru
          const [updatedUser] = await db.query('SELECT * FROM users WHERE id = ?', [usersByEmail[0].id]);
          return done(null, updatedUser[0]);
        }

        // 3. Jika belum ada sama sekali, buat user baru
        // Catatan: User baru via Google dianggap sudah terverifikasi (is_verified = 1)
        const [result] = await db.query(
          'INSERT INTO users (name, email, google_id, avatar_url, is_verified) VALUES (?, ?, ?, ?, ?)',
          [name, email, googleId, avatarUrl, 1]
        );

        const userId = result.insertId;
        Logger.auth('GOOGLE_OAUTH_NEW_USER', `Created new user via Google: ${userId}`);

        // 🎁 ADD TRIAL PACKAGE (3 DAYS)
        const [trialPackages] = await db.query(
          'SELECT id, duration_days, name FROM packages WHERE is_trial = 1 AND is_active = 1 LIMIT 1'
        );

        if (trialPackages.length > 0) {
          // ANTI-ABUSE CHECK (by email)
          const [history] = await db.query(
            `SELECT id FROM deleted_users_history 
            WHERE email = ? AND has_used_trial = 1 LIMIT 1`,
            [email]
          );

          if (history.length > 0) {
            Logger.info('TRIAL_SKIPPED', `Trial DENIED for Google user ${userId} (Abuse Prevention)`);
          } else {
            const trial = trialPackages[0];
            await db.query(
              `INSERT INTO user_tokens
              (user_id, package_id, token, activated_at, expired_at, is_active, is_trial)
              VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 1, 1)`,
              [userId, trial.id, uuid(), trial.duration_days]
            );
            Logger.info('TRIAL_ACTIVATED', `Trial package ${trial.name} activated for Google user ${userId}`);
          }
        }

        const [newUser] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        return done(null, newUser[0]);

      } catch (error) {
        Logger.error('GOOGLE_OAUTH_ERROR', 'Error in Google Strategy callback', error);
        return done(error, null);
      }
    }
  ));
} else {
  Logger.warn('PASSPORT', 'Google OAuth credentials missing in .env. Login with Google will not work.');
}

// Passport serialize/deserialize (Required if using sessions, even if minimal)
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    done(null, users[0]);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
