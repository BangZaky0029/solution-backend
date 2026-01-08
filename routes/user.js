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
router.get('/me', authMiddleware, (req, res) => {
  const query = `
    SELECT 
      id,
      name,
      email,
      phone,
      is_verified,
      created_at
    FROM users
    WHERE id = ?
  `;

  db.query(query, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(rows[0]);
  });
});

// ================================
// GET CURRENT USER TOKENS
// ================================
router.get('/tokens', authMiddleware, (req, res) => {
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

  db.query(query, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
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
router.get('/', adminAuth, (req, res) => {
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

  db.query(query, (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

module.exports = router;
