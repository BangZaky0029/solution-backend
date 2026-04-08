const mysql = require('mysql2/promise');
require('dotenv').config();

async function test() {
  console.log('Testing connection to:', process.env.DB_HOST, 'port:', process.env.DB_PORT || 3306);
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectTimeout: 5000
    });
    console.log('SUCCESS');
    await connection.end();
  } catch (err) {
    console.error('FAILED:', err);
  }
}

test();
