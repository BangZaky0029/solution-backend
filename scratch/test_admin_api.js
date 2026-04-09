require('dotenv').config();
const db = require('../config/db');

async function testAdminAPI() {
  try {
    const query = `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.phone, 
        u.is_verified, 
        u.created_at, 
        u.last_login_at, 
        u.login_count
      FROM users u
      WHERE u.id IN (190, 199)
      ORDER BY u.created_at DESC
    `;

    const [rows] = await db.query(query);
    console.log('API Response (selected users):', JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testAdminAPI();
