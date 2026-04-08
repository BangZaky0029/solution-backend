// C:\codingVibes\nuansasolution\.mainweb\payments\solution-backend\scripts\migration_google_auth.js
require('dotenv').config();
const db = require('../config/db');

async function migrate() {
    try {
        console.log('🚀 Starting Database Migration for Google Auth...');

        // 1. Add google_id column
        await db.query(`
            ALTER TABLE users 
            ADD COLUMN google_id VARCHAR(255) UNIQUE AFTER id;
        `);
        console.log('✅ Added google_id column');

        // 2. Add avatar_url column
        await db.query(`
            ALTER TABLE users 
            ADD COLUMN avatar_url TEXT AFTER phone;
        `);
        console.log('✅ Added avatar_url column');

        // 3. Ensure email is unique (should already be, but for safety)
        const [indexes] = await db.query('SHOW INDEX FROM users WHERE Column_name = "email"');
        if (indexes.length === 0) {
            await db.query('ALTER TABLE users ADD UNIQUE (email)');
            console.log('✅ Ensured email is UNIQUE');
        }

        console.log('🎉 Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrate();
