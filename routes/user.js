// ==========================================
// routes/user.js - User Management - FINAL
// ==========================================
const express = require('express');
const router = express.Router();
const db = require('../config/db');

const adminAuth = require('../middlewares/adminMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');

// Feature Access Controller
const featureAccessController = require('../controllers/featureAccessController');

// Admin User Controller
const adminUserController = require('../controllers/adminUserController');

// ================================
// GET CURRENT USER PROFILE
// ================================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT id, name, email, phone, is_verified, created_at
      FROM users
      WHERE id = ?
    `;

    const [rows] = await db.query(query, [req.user.id]);

    if (!rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// ================================
// GET CURRENT USER ACTIVE TOKENS
// ================================
router.get('/tokens', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT 
        ut.id,
        ut.package_id,
        ut.is_active,
        ut.activated_at,
        ut.expired_at,

        p.name AS package_name,
        p.price,
        p.duration_days
      FROM user_tokens ut
      JOIN packages p ON p.id = ut.package_id
      WHERE 
        ut.user_id = ?
        AND ut.is_active = 1
        AND ut.expired_at > NOW()
      ORDER BY ut.expired_at DESC
    `;

    const [rows] = await db.query(query, [req.user.id]);

    // 🔥 JANGAN dibungkus success/data
    // FE butuh ARRAY langsung
    res.json(rows);

  } catch (error) {
    console.error('GET /users/tokens error:', error);
    res.status(500).json([]);
  }
});



// ======================================================
// FEATURE ACCESS ROUTES (🔥 INI YANG HILANG SEBELUMNYA)
// ======================================================

// GET /api/users/feature-access-status
router.get(
  '/feature-access-status',
  authMiddleware,
  featureAccessController.getFeatureAccessStatus
);

// GET /api/users/feature-access-details
router.get(
  '/feature-access-details',
  authMiddleware,
  featureAccessController.getFeatureAccessDetails
);

// POST /api/users/check-feature-access
router.post(
  '/check-feature-access',
  authMiddleware,
  featureAccessController.checkFeatureAccess
);


// ================================
// ADMIN USER MANAGEMENT ROUTES
// ================================
router.get('/', adminAuth, adminUserController.getAllUsers);
router.get('/:id', adminAuth, adminUserController.getUserDetail);


module.exports = router;
