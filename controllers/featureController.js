const db = require('../config/db');

/**
 * GET FEATURES BY USER
 */
exports.getMyFeatures = async (req, res) => {
  try {
    const userId = req.user.id; // dari auth middleware

    const [tokenRows] = await db.query(
      `SELECT package_id
       FROM user_tokens
       WHERE user_id = ? AND is_active = 1
       ORDER BY activated_at DESC
       LIMIT 1`,
      [userId]
    );

    if (!tokenRows.length) {
      return res.json({ features: [] });
    }

    const packageId = tokenRows[0].package_id;

    const [features] = await db.query(
      `SELECT f.id, f.name, f.code, f.status
       FROM package_features pf
       JOIN features f ON f.id = pf.feature_id
       WHERE pf.package_id = ?`,
      [packageId]
    );

    res.json({ features });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

