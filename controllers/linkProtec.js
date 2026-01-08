// =========================================
// FILE: controllers/linkProtec.js - FIXED
// PERBAIKAN: Cek package_features dengan benar
// =========================================

const db = require('../config/db');

/**
 * checkLinkAccess
 * POST body: { path: "/invoice" }
 * req.user.id => didapat dari authMiddleware (JWT)
 * 
 * FLOW:
 * 1. Normalisasi path
 * 2. Cari feature dari database
 * 3. Jika feature tidak ada → PUBLIC
 * 4. Jika feature FREE → akses semua
 * 5. Jika feature PREMIUM:
 *    a. Cek user login
 *    b. Cek user punya active subscription
 *    c. Cek feature ada di package_features dari paket yang dibeli
 *    d. Jika semua OK → ALLOWED
 */
exports.checkLinkAccess = (req, res) => {
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
  // STEP 2: AMBIL FITUR DARI DATABASE
  // =========================
  const featureQuery = `
    SELECT id, name, code, status 
    FROM features 
    WHERE LOWER(code) = ?
    LIMIT 1
  `;

  db.query(featureQuery, [path], (err, features) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Database error',
        error: err
      });
    }

    // =========================
    // STEP 3: FITUR TIDAK ADA → PUBLIC
    // =========================
    if (features.length === 0) {
      return res.json({
        success: true,
        allowed: true,
        message: 'Public feature (tidak terdaftar)',
        featureId: null
      });
    }

    const feature = features[0];

    // =========================
    // STEP 4: FITUR FREE → AKSES SEMUA
    // =========================
    if (feature.status === 'free') {
      return res.json({
        success: true,
        allowed: true,
        feature: feature.name,
        featureId: feature.id,
        reason: 'FREE_FEATURE',
        message: 'Fitur gratis, akses dibuka untuk semua'
      });
    }

    // =========================
    // STEP 5: FITUR PREMIUM
    // =========================
    // Cek user login
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        allowed: false,
        reason: 'NOT_LOGIN',
        feature: feature.name,
        featureId: feature.id,
        message: 'Silakan login terlebih dahulu untuk akses fitur premium'
      });
    }

    // =========================
    // STEP 5A: CEK USER PUNYA ACTIVE SUBSCRIPTION
    // =========================
    const activeSubscriptionQuery = `
      SELECT ut.id, ut.package_id, ut.expired_at, p.name as package_name
      FROM user_tokens ut
      JOIN packages p ON p.id = ut.package_id
      WHERE ut.user_id = ? 
        AND ut.is_active = 1
        AND ut.expired_at > NOW()
      LIMIT 1
    `;

    db.query(activeSubscriptionQuery, [req.user.id], (err, subscriptions) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Database error saat cek subscription',
          error: err
        });
      }

      // Tidak punya subscription sama sekali
      if (!subscriptions || subscriptions.length === 0) {
        return res.status(403).json({
          success: false,
          allowed: false,
          reason: 'NOT_SUBSCRIBED',
          feature: feature.name,
          featureId: feature.id,
          message: 'Anda belum memiliki langganan aktif. Silakan upgrade paket Anda'
        });
      }

      const activeSubscription = subscriptions[0];

      // =========================
      // STEP 5B: CEK FEATURE ADA DI PACKAGE_FEATURES
      // =========================
      const packageFeatureQuery = `
        SELECT pf.id
        FROM package_features pf
        WHERE pf.package_id = ? 
          AND pf.feature_id = ?
        LIMIT 1
      `;

      db.query(packageFeatureQuery, [activeSubscription.package_id, feature.id], (err, packageFeatures) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: 'Database error saat cek package features',
            error: err
          });
        }

        // =========================
        // STEP 5C: FEATURE TIDAK ADA DI PAKET INI
        // =========================
        if (!packageFeatures || packageFeatures.length === 0) {
          return res.status(403).json({
            success: false,
            allowed: false,
            reason: 'FEATURE_NOT_IN_PACKAGE',
            feature: feature.name,
            featureId: feature.id,
            packageName: activeSubscription.package_name,
            message: `Fitur "${feature.name}" tidak termasuk dalam paket "${activeSubscription.package_name}" Anda. Silakan upgrade ke paket yang lebih tinggi`
          });
        }

        // =========================
        // STEP 5D: SEMUA CEK OK → ALLOWED
        // =========================
        return res.json({
          success: true,
          allowed: true,
          reason: 'PREMIUM_SUBSCRIBED',
          feature: feature.name,
          featureId: feature.id,
          packageName: activeSubscription.package_name,
          expiresAt: activeSubscription.expired_at,
          message: 'Akses granted - fitur termasuk dalam paket Anda'
        });
      });
    });
  });
};

/**
 * getFeatureAccessInfo
 * GET /link/access-info/:featureId
 * Utility endpoint untuk cek info access sebuah feature
 */
exports.getFeatureAccessInfo = (req, res) => {
  const { featureId } = req.params;

  if (!featureId) {
    return res.status(400).json({
      success: false,
      message: 'Feature ID is required'
    });
  }

  // Ambil info feature
  const featureQuery = `
    SELECT id, name, code, status
    FROM features
    WHERE id = ?
    LIMIT 1
  `;

  db.query(featureQuery, [featureId], (err, features) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error', error: err });
    }

    if (!features || features.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Feature not found'
      });
    }

    const feature = features[0];

    // Jika PUBLIC atau FREE
    if (feature.status === 'free' || !feature.status) {
      return res.json({
        success: true,
        feature: feature.name,
        status: 'free',
        message: 'Fitur gratis, akses untuk semua user'
      });
    }

    // Jika PREMIUM dan user login
    if (req.user && req.user.id) {
      const packageQuery = `
        SELECT 
          p.id,
          p.name,
          pf.feature_id,
          ut.expired_at
        FROM packages p
        LEFT JOIN package_features pf ON pf.package_id = p.id
        LEFT JOIN user_tokens ut ON ut.package_id = p.id
        WHERE pf.feature_id = ? 
          AND ut.user_id = ?
          AND ut.is_active = 1
          AND ut.expired_at > NOW()
      `;

      db.query(packageQuery, [featureId, req.user.id], (err, packageData) => {
        if (err) {
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (packageData && packageData.length > 0) {
          return res.json({
            success: true,
            feature: feature.name,
            status: 'premium',
            hasAccess: true,
            packages: [...new Set(packageData.map(p => p.name))],
            expiresAt: packageData[0].expired_at
          });
        } else {
          return res.json({
            success: true,
            feature: feature.name,
            status: 'premium',
            hasAccess: false,
            message: 'Feature premium, tapi belum berlangganan'
          });
        }
      });
    } else {
      return res.json({
        success: true,
        feature: feature.name,
        status: 'premium',
        hasAccess: false,
        message: 'Feature premium, silakan login'
      });
    }
  });
};

/**
 * getUserPackageFeatures
 * GET /link/user-features
 * Dapatkan semua feature yang bisa diakses user
 */
exports.getUserPackageFeatures = (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      success: false,
      message: 'User not authenticated'
    });
  }

  const query = `
    SELECT DISTINCT
      f.id,
      f.name,
      f.code,
      f.status,
      p.name as package_name,
      ut.expired_at
    FROM features f
    LEFT JOIN package_features pf ON pf.feature_id = f.id
    LEFT JOIN packages p ON p.id = pf.package_id
    LEFT JOIN user_tokens ut ON ut.package_id = p.id
    WHERE f.status = 'free'
      OR (
        ut.user_id = ? 
        AND ut.is_active = 1
        AND ut.expired_at > NOW()
        AND pf.feature_id IS NOT NULL
      )
    ORDER BY f.status DESC, f.name ASC
  `;

  db.query(query, [req.user.id], (err, features) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Database error',
        error: err
      });
    }

    const freeFeatures = features.filter(f => f.status === 'free');
    const premiumFeatures = features.filter(f => f.status === 'premium');

    res.json({
      success: true,
      freeFeatures,
      premiumFeatures,
      totalFeatures: features.length,
      totalFreeFeatures: freeFeatures.length,
      totalPremiumFeatures: premiumFeatures.length
    });
  });
};