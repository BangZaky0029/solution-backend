// =========================================
// FILE: controllers/linkProtec.js
// REFACTORED: mysql2/promise + async/await
// =========================================

const db = require('../config/db');

/**
 * POST /link/check-access
 * body: { path: "/invoice" }
 */
exports.checkLinkAccess = async (req, res) => {
  try {
    let { path } = req.body;

    if (!path) {
      return res.status(400).json({
        success: false,
        message: 'Path is required'
      });
    }

    // =========================
    // STEP 1: NORMALISASI PATH
    // =========================
    path = path.replace(/\/+$/, '').toLowerCase();

    // =========================
    // STEP 2: AMBIL FEATURE
    // =========================
    const [features] = await db.query(
      `SELECT id, name, code, status
       FROM features
       WHERE LOWER(code) = ?
       LIMIT 1`,
      [path]
    );

    // =========================
    // STEP 3: FEATURE TIDAK ADA → PUBLIC
    // =========================
    if (!features.length) {
      return res.json({
        success: true,
        allowed: true,
        reason: 'PUBLIC_FEATURE'
      });
    }

    const feature = features[0];

    // =========================
    // STEP 4: FREE FEATURE
    // =========================
    if (feature.status === 'free') {
      return res.json({
        success: true,
        allowed: true,
        reason: 'FREE_FEATURE',
        feature: feature.name
      });
    }

    // =========================
    // STEP 5: PREMIUM FEATURE
    // =========================
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        allowed: false,
        reason: 'NOT_LOGIN',
        message: 'Silakan login untuk mengakses fitur premium'
      });
    }

    // =========================
    // STEP 5A: CEK SUBSCRIPTION
    // =========================
    const [subs] = await db.query(
      `SELECT ut.package_id, ut.expired_at, p.name AS package_name
       FROM user_tokens ut
       JOIN packages p ON p.id = ut.package_id
       WHERE ut.user_id = ?
         AND ut.is_active = 1
         AND ut.expired_at > NOW()
       ORDER BY ut.activated_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (!subs.length) {
      return res.status(403).json({
        success: false,
        allowed: false,
        reason: 'NOT_SUBSCRIBED',
        message: 'Anda belum memiliki langganan aktif'
      });
    }

    const subscription = subs[0];

    // =========================
    // STEP 5B: CEK FEATURE DALAM PACKAGE
    // =========================
    const [pf] = await db.query(
      `SELECT 1
       FROM package_features
       WHERE package_id = ?
         AND feature_id = ?
       LIMIT 1`,
      [subscription.package_id, feature.id]
    );

    if (!pf.length) {
      return res.status(403).json({
        success: false,
        allowed: false,
        reason: 'FEATURE_NOT_IN_PACKAGE',
        feature: feature.name,
        packageName: subscription.package_name
      });
    }

    // =========================
    // STEP 5C: ALLOWED
    // =========================
    return res.json({
      success: true,
      allowed: true,
      reason: 'PREMIUM_SUBSCRIBED',
      feature: feature.name,
      packageName: subscription.package_name,
      expiresAt: subscription.expired_at
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * GET /link/access-info/:featureId
 */
exports.getFeatureAccessInfo = async (req, res) => {
  try {
    const { featureId } = req.params;

    const [features] = await db.query(
      `SELECT id, name, code, status
       FROM features
       WHERE id = ?
       LIMIT 1`,
      [featureId]
    );

    if (!features.length) {
      return res.status(404).json({
        success: false,
        message: 'Feature not found'
      });
    }

    const feature = features[0];

    if (feature.status === 'free') {
      return res.json({
        success: true,
        status: 'free',
        hasAccess: true
      });
    }

    if (!req.user?.id) {
      return res.json({
        success: true,
        status: 'premium',
        hasAccess: false,
        message: 'Silakan login'
      });
    }

    const [access] = await db.query(
      `SELECT p.name, ut.expired_at
       FROM user_tokens ut
       JOIN packages p ON p.id = ut.package_id
       JOIN package_features pf ON pf.package_id = p.id
       WHERE ut.user_id = ?
         AND ut.is_active = 1
         AND ut.expired_at > NOW()
         AND pf.feature_id = ?`,
      [req.user.id, featureId]
    );

    return res.json({
      success: true,
      status: 'premium',
      hasAccess: access.length > 0,
      packageName: access[0]?.name || null,
      expiresAt: access[0]?.expired_at || null
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /link/user-features
 */
exports.getUserPackageFeatures = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const [features] = await db.query(
      `SELECT DISTINCT
        f.id, f.name, f.code, f.status
       FROM features f
       LEFT JOIN package_features pf ON pf.feature_id = f.id
       LEFT JOIN user_tokens ut ON ut.package_id = pf.package_id
       WHERE f.status = 'free'
          OR (
            ut.user_id = ?
            AND ut.is_active = 1
            AND ut.expired_at > NOW()
          )
       ORDER BY f.status DESC, f.name ASC`,
      [req.user.id]
    );

    res.json({
      success: true,
      freeFeatures: features.filter(f => f.status === 'free'),
      premiumFeatures: features.filter(f => f.status === 'premium')
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
