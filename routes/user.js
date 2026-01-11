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
// GET CURRENT USER TOKENS
// ================================
router.get('/tokens', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT 
        ut.*,
        p.name AS package_name,
        p.price,
        p.duration_days
      FROM user_tokens ut
      JOIN packages p ON p.id = ut.package_id
      WHERE ut.user_id = ?
      ORDER BY ut.activated_at DESC
    `;

    const [rows] = await db.query(query, [req.user.id]);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
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
// GET ALL USERS (ADMIN) - WITH PACKAGE STATUS
// ================================
router.get('/', adminAuth, async (req, res) => {
  try {
    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone,
        u.is_verified,
        u.created_at,

        ut.package_id,
        p.name AS package_name,
        ut.expired_at,
        ut.is_active

      FROM users u
      LEFT JOIN user_tokens ut 
        ON ut.user_id = u.id
        AND ut.is_active = 1
        AND ut.expired_at > NOW()

      LEFT JOIN packages p 
        ON p.id = ut.package_id

      ORDER BY u.created_at DESC
    `;

    const [rows] = await db.query(query);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


module.exports = router;
