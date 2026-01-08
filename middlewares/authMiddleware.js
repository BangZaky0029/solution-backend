// =========================================
// FILE: middlewares/authMiddleware.js
// =========================================

const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'Token tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Token kosong' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔥 FIX UTAMA
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role || 'user'
    };

    next();
  } catch (err) {
    return res.status(403).json({ message: 'Token tidak valid' });
  }
};
