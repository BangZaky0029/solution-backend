// =========================================
// FILE: config/db.js - UPDATED
// MySQL2/Promise Configuration
// =========================================

const mysql = require('mysql2/promise');
const Logger = require('../utils/logger');

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Test connection on startup
db.getConnection()
  .then(connection => {
    Logger.info('DATABASE', 'Database connected successfully');
    connection.release();
  })
  .catch(error => {
    Logger.error('DATABASE', 'Database connection failed', error);
    process.exit(1);
  });

module.exports = db;