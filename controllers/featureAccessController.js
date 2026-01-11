// controllers/featureAccessController.js
const db = require('../config/db');

// ===============================
// Helper: ambil token aktif user
// ===============================
const getActiveToken = async (userId) => {
  const [rows] = await db.query(
    `SELECT ut.*, p.name AS package_name
     FROM user_tokens ut
     JOIN packages p ON p.id = ut.package_id
     WHERE ut.user_id = ?
     AND ut.is_active = 1
     AND ut.expired_at > NOW()
     ORDER BY ut.activated_at DESC
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
};


// ===============================
// GET /api/users/feature-access-status
// ===============================
exports.getFeatureAccessStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    // ambil semua feature
    const [features] = await db.query(`SELECT id, code, status FROM features`);

    // ambil token aktif
    const token = await getActiveToken(userId);

    let allowedFeatureIds = [];
    if (token) {
      const [rows] = await db.query(
        `SELECT feature_id FROM package_features WHERE package_id = ?`,
        [token.package_id]
      );
      allowedFeatureIds = rows.map(r => r.feature_id);
    }

    const allowedSet = new Set(allowedFeatureIds);

    const result = {};
    features.forEach(feature => {
      if (feature.status === 'free') {
        result[feature.code] = 'free';
      } else if (token && allowedSet.has(feature.id)) {
        result[feature.code] = 'subscribed';
      } else {
        result[feature.code] = 'premium';
      }
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};




// ===============================
// GET /api/users/feature-access-details
// ===============================
exports.getFeatureAccessDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const token = await getActiveToken(userId);

    if (!token) {
      return res.json({
        success: true,
        package_name: null,
        package_id: null,
        activated_at: null,
        expired_at: null,
        active_features: []
      });
    }

    const [features] = await db.query(
      `SELECT f.id, f.code, f.name
       FROM package_features pf
       JOIN features f ON f.id = pf.feature_id
       WHERE pf.package_id = ?`,
      [token.package_id]
    );

    res.json({
      success: true,
      package_name: token.package_name,
      package_id: token.package_id,
      activated_at: token.activated_at,
      expired_at: token.expired_at,
      active_features: features
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// ===============================
// POST /api/users/check-feature-access
// ===============================
exports.checkFeatureAccess = async (req, res) => {
  try {
    const userId = req.user.id;
    const { feature_code } = req.body;

    const token = await getActiveToken(userId);

    const [rows] = await db.query(
      `SELECT * FROM features WHERE code = ?`,
      [feature_code]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Feature tidak ditemukan' });
    }

    const feature = rows[0];

    if (feature.status === 'free') {
      return res.json({ success: true, allowed: true, status: 'free' });
    }

    if (!token) {
      return res.status(403).json({
        success: false,
        allowed: false,
        status: 'premium',
        message: 'User belum berlangganan'
      });
    }

    const [access] = await db.query(
      `SELECT 1 FROM package_features WHERE package_id = ? AND feature_id = ?`,
      [token.package_id, feature.id]
    );

    if (access.length) {
      return res.json({
        success: true,
        allowed: true,
        status: 'subscribed'
      });
    }

    res.status(403).json({
      success: false,
      allowed: false,
      status: 'premium',
      message: 'User perlu upgrade'
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

