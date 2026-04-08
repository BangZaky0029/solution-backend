require('dotenv').config();
const db = require('../config/db');

async function migrate() {
  console.log('🚀 Starting Migration: Adding Phone Verification Columns...');
  
  try {
    // 1. Add is_phone_verified column
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN is_phone_verified TINYINT(1) DEFAULT 0 AFTER is_verified
    `);
    console.log('✅ Column is_phone_verified added.');

    // 2. Add last_otp_sent_at for rate limiting
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN last_otp_sent_at TIMESTAMP NULL AFTER is_phone_verified
    `);
    console.log('✅ Column last_otp_sent_at added.');

    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    if (error.code === 'ER_DUP_COLUMN_NAME') {
      console.log('⚠️ Columns already exist. Skipping.');
      process.exit(0);
    }
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
