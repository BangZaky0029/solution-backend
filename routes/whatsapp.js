// =========================================
// FILE: routes/whatsapp.js
// WhatsApp Bot Routes
// =========================================

const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');
const adminAuth = require('../middlewares/adminMiddleware');

// All routes require admin authentication

/**
 * GET /api/whatsapp/status
 * Get WhatsApp connection status
 */
router.get('/status', adminAuth, whatsappController.getStatus);

/**
 * GET /api/whatsapp/qr
 * Get QR code for WhatsApp connection
 */
router.get('/qr', adminAuth, whatsappController.getQRCode);

/**
 * POST /api/whatsapp/restart
 * Restart WhatsApp connection
 */
router.post('/restart', adminAuth, whatsappController.restart);

/**
 * POST /api/whatsapp/disconnect
 * Disconnect WhatsApp
 */
router.post('/disconnect', adminAuth, whatsappController.disconnect);

/**
 * POST /api/whatsapp/send-test
 * Send test message (admin only)
 */
router.post('/send-test', adminAuth, whatsappController.sendTestMessage);

/**
 * POST /api/whatsapp/validate-number
 * Validate if phone number is registered on WhatsApp
 */
router.post('/validate-number', adminAuth, whatsappController.validateNumber);

module.exports = router;