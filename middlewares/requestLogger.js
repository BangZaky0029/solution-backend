// =========================================
// FILE: middlewares/requestLogger.js - NEW
// Request Logging Middleware
// =========================================

const Logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request
  Logger.api(
    req.method,
    req.path,
    'STARTED',
    0,
    req.user?.id || null
  );

  // Capture response
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;

    Logger.api(
      req.method,
      req.path,
      res.statusCode,
      duration,
      req.user?.id || null
    );

    originalSend.call(this, data);
  };

  next();
};

module.exports = requestLogger;