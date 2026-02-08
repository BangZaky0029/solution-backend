require('dotenv').config();
const db = require('./config/db');

async function migrate() {
    try {
        console.log('Running migration...');
        await db.query(`
      ALTER TABLE otp_verifications 
      MODIFY COLUMN type ENUM('verify', 'reset', 'delete_account') DEFAULT 'verify'
    `);
        console.log('Migration successful: Added delete_account to otp_verifications type enum');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
