// =========================================
// FILE: routes/access.js
// Access Check Routes - Public Endpoints
// =========================================

const express = require('express');
const router = express.Router();
const accessController = require('../controllers/accessController');

/**
 * POST /api/access/check
 * Check if user has access to a specific feature
 * Public endpoint - no authentication required
 */
router.post('/check', accessController.checkAccess);

/**
 * POST /api/access/check-multiple
 * Check if user has access to multiple features at once
 * Public endpoint - no authentication required
 */
router.post('/check-multiple', accessController.checkMultipleAccess);

module.exports = router;
