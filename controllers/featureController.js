const db = require('../config/db');

/**
 * GET FEATURES BY USER
 */
exports.getMyFeatures = (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Token missing' });

  const token = authHeader.split(' ')[1];
  const jwt = require('jsonwebtoken');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // Ambil package aktif user
    db.query(
      `SELECT package_id 
       FROM user_tokens 
       WHERE user_id=? AND is_active=1
       ORDER BY activated_at DESC 
       LIMIT 1`,
      [userId],
      (err, rows) => {
        if (err || !rows.length) return res.json({ features: [] });

        const packageId = rows[0].package_id;

        // Ambil semua fitur package
        db.query(
          `SELECT f.id, f.name, f.code, f.status
           FROM package_features pf
           JOIN features f ON f.id = pf.feature_id
           WHERE pf.package_id=?`,
          [packageId],
          (err, features) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json({ features });
          }
        );
      }
    );
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};
