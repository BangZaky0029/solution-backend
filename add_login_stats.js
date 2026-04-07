require('dotenv').config({ path: 'C:/codingVibes/nuansasolution/.mainweb/payments/solution-backend/.env' });
const db = require('C:/codingVibes/nuansasolution/.mainweb/payments/solution-backend/config/db');

async function migrate() {
    try {
        console.log('Running migration to add login tracking...');
        await db.query(`
      ALTER TABLE users 
      ADD COLUMN last_login_at DATETIME NULL DEFAULT NULL,
      ADD COLUMN login_count INT NOT NULL DEFAULT 0
    `);
        console.log('Migration successful: Added last_login_at and login_count to users table');
        process.exit(0);
    } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('Columns already exist. Skipping.');
            process.exit(0);
        } else {
            console.error('Migration failed:', error);
            process.exit(1);
        }
    }
}

migrate();
