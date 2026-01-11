// =========================================
// FILE: utils/logger.js - NEW
// Comprehensive Logging System
// =========================================

const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log files
const LOG_FILES = {
  ERROR: path.join(logsDir, 'error.log'),
  INFO: path.join(logsDir, 'info.log'),
  WHATSAPP: path.join(logsDir, 'whatsapp.log'),
  AUTH: path.join(logsDir, 'auth.log'),
  PAYMENT: path.join(logsDir, 'payment.log'),
  API: path.join(logsDir, 'api.log'),
};

/**
 * Format log message with timestamp
 */
const formatLog = (level, category, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logData = data ? `\nData: ${JSON.stringify(data, null, 2)}` : '';
  return `[${timestamp}] [${level}] [${category}] ${message}${logData}\n`;
};

/**
 * Write to log file
 */
const writeLog = (file, content) => {
  try {
    fs.appendFileSync(file, content);
  } catch (error) {
    console.error('Failed to write log:', error);
  }
};

/**
 * Logger class
 */
class Logger {
  /**
   * Log ERROR
   */
  static error(category, message, error = null) {
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      ...error
    } : null;

    const log = formatLog('ERROR', category, message, errorData);
    writeLog(LOG_FILES.ERROR, log);
    console.error(`❌ [${category}]`, message, errorData);
  }

  /**
   * Log INFO
   */
  static info(category, message, data = null) {
    const log = formatLog('INFO', category, message, data);
    writeLog(LOG_FILES.INFO, log);
    console.log(`ℹ️ [${category}]`, message, data || '');
  }

  /**
   * Log WhatsApp activity
   */
  static whatsapp(action, message, data = null) {
    const log = formatLog('WHATSAPP', action, message, data);
    writeLog(LOG_FILES.WHATSAPP, log);
    console.log(`📱 [WhatsApp][${action}]`, message);
  }

  /**
   * Log Authentication
   */
  static auth(action, message, data = null) {
    const log = formatLog('AUTH', action, message, data);
    writeLog(LOG_FILES.AUTH, log);
    console.log(`🔐 [Auth][${action}]`, message);
  }

  /**
   * Log Payment
   */
  static payment(action, message, data = null) {
    const log = formatLog('PAYMENT', action, message, data);
    writeLog(LOG_FILES.PAYMENT, log);
    console.log(`💳 [Payment][${action}]`, message);
  }

  /**
   * Log API Request
   */
  static api(method, path, status, duration, userId = null) {
    const data = {
      method,
      path,
      status,
      duration: `${duration}ms`,
      userId,
      timestamp: new Date().toISOString()
    };

    const log = formatLog('API', method, `${path} - ${status}`, data);
    writeLog(LOG_FILES.API, log);
  }

  /**
   * Clear old logs (older than 30 days)
   */
  static clearOldLogs() {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    Object.values(LOG_FILES).forEach(file => {
      try {
        const stats = fs.statSync(file);
        if (stats.mtimeMs < thirtyDaysAgo) {
          fs.writeFileSync(file, ''); // Clear file content
          Logger.info('SYSTEM', `Cleared old logs: ${path.basename(file)}`);
        }
      } catch (error) {
        // File doesn't exist, ignore
      }
    });
  }
}

// Clear old logs on startup
Logger.clearOldLogs();

// Schedule daily log cleanup (at midnight)
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    Logger.clearOldLogs();
  }
}, 60000); // Check every minute

module.exports = Logger;