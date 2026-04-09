require('dotenv').config();
const db = require('../config/db');

async function checkSchema() {
  try {
    const [rows] = await db.query('SHOW CREATE TABLE users');
    console.log('Users Table Schema:', rows[0]['Create Table']);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSchema();
