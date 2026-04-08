const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '../.env') });

async function fixSchema() {
  console.log('🚀 Starting database schema fix...');
  console.log(`Connecting to: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306} (${process.env.DB_NAME})`);

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    console.log('✅ Connected to database.');

    // 1. Modify column 'type' to allow longer strings
    console.log('Task 1: Modifying otp_verifications.type length...');
    await connection.query('ALTER TABLE otp_verifications MODIFY COLUMN type VARCHAR(50);');
    console.log('✅ Column type modified to VARCHAR(50).');

    // 2. Add composite index for performance (optional but good practice)
    console.log('Task 2: Ensuring necessary indexes exist...');
    try {
      await connection.query('CREATE INDEX idx_user_type_created ON otp_verifications (user_id, type, created_at);');
      console.log('✅ Index created.');
    } catch (idxError) {
      console.log('ℹ️ Index might already exist, skipping.');
    }

    await connection.end();
    console.log('\n✨ Database schema fix completed successfully!');
    console.log('You can now retry the WhatsApp verification.');

  } catch (error) {
    console.error('\n❌ Error fixing database schema:');
    console.error(error.message);
    process.exit(1);
  }
}

fixSchema();
