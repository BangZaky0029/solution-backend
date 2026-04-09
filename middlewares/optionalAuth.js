const jwt = require('jsonwebtoken');

/**
 * Optional Authentication Middleware
 * Populates req.user if a valid token is present, but does not block the request if not.
 */
module.exports = function (req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role || 'user'
        };
      } catch (err) {
        // Silent fail for optional auth
      }
    }
  }
  
  next();
};
