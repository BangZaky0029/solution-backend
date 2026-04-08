// =========================================
// scripts/migrate_surveys.js
// Migration Script for User Survey System
// =========================================

require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log('🚀 Starting migration for Survey System...');

  try {
    // 1. Create user_acquisition table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_acquisition (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        source ENUM('Google', 'TikTok', 'Instagram', 'Facebook', 'Friend', 'Other') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        UNIQUE KEY unique_user_acquisition (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ Table user_acquisition created or already exists.');

    // 2. Create user_feedback table (without UNIQUE KEY to allow history)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_feedback (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        rating TINYINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        admin_reply TEXT,
        admin_reply_at TIMESTAMP NULL,
        is_hidden TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ Table user_feedback created or already exists.');

    // 3. Drop unique index and add columns if not exists
    try {
      await connection.query('ALTER TABLE user_feedback DROP INDEX unique_user_feedback;');
    } catch (err) { /* ignore if already dropped */ }

    try {
      await connection.query('ALTER TABLE user_feedback ADD COLUMN admin_reply TEXT, ADD COLUMN admin_reply_at TIMESTAMP NULL;');
      console.log('✅ Admin reply columns added.');
    } catch (err) { /* ignore if already exist */ }

    try {
      await connection.query('ALTER TABLE user_feedback ADD COLUMN is_hidden TINYINT(1) DEFAULT 0;');
      console.log('✅ Column is_hidden added to user_feedback.');
    } catch (err) {
      if (err.code === 'ER_DUP_COLUMN_NAME') {
        console.log('ℹ️ Column is_hidden already exists.');
      } else {
        console.warn('⚠️ Warning while updating schema:', err.message);
      }
    }



    // 4. Optionally remove submission_count column if it's there
    try {
      await connection.query('ALTER TABLE user_feedback DROP COLUMN submission_count;');
      console.log('✅ Cleaned up submission_count column.');
    } catch (err) {
      // ignore
    }



    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await connection.end();
  }
}

migrate();
