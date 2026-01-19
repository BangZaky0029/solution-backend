// =========================================
// FILE: routes/whatsapp.js - FIXED
// WhatsApp API Routes
// =========================================

const express = require('express');
const router = express.Router();
const whatsappClient = require('../utils/whatsappClient');
const Logger = require('../utils/logger');

/**
 * GET /api/whatsapp/status
 * Get WhatsApp connection status
 */
router.get('/status', async (req, res) => {
  try {
    const status = whatsappClient.getStatus();
    
    res.json({
      success: true,
      status: status.status,
      isReady: status.isReady,
      qrCode: status.qrCode,
      info: status.info,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('WHATSAPP_ROUTE', 'Error getting status', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get WhatsApp status',
      error: error.message
    });
  }
});

/**
 * POST /api/whatsapp/restart
 * Restart WhatsApp client
 */
router.post('/restart', async (req, res) => {
  try {
    Logger.info('WHATSAPP_ROUTE', 'Restart requested');
    
    const result = await whatsappClient.restart();
    
    res.json({
      success: true,
      message: 'WhatsApp client restart initiated',
      data: result
    });
  } catch (error) {
    Logger.error('WHATSAPP_ROUTE', 'Restart failed', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restart WhatsApp client',
      error: error.message
    });
  }
});

/**
 * POST /api/whatsapp/disconnect
 * Disconnect WhatsApp client
 */
router.post('/disconnect', async (req, res) => {
  try {
    Logger.info('WHATSAPP_ROUTE', 'Disconnect requested');
    
    const result = await whatsappClient.disconnect();
    
    res.json({
      success: true,
      message: 'WhatsApp disconnected successfully',
      data: result
    });
  } catch (error) {
    Logger.error('WHATSAPP_ROUTE', 'Disconnect failed', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect WhatsApp',
      error: error.message
    });
  }
});

/**
 * POST /api/whatsapp/send-test
 * Send test message
 */
router.post('/send-test', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    // Validation
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }

    if (!whatsappClient.isReady) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp is not connected. Please wait or restart the connection.'
      });
    }

    Logger.info('WHATSAPP_ROUTE', `Sending test message to ${phoneNumber}`);

    const result = await whatsappClient.sendMessage(phoneNumber, message);

    res.json({
      success: true,
      message: 'Message sent successfully',
      data: result
    });

  } catch (error) {
    Logger.error('WHATSAPP_ROUTE', 'Send test failed', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send message'
    });
  }
});

/**
 * POST /api/whatsapp/validate-number
 * Validate if number is registered on WhatsApp
 */
router.post('/validate-number', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    if (!whatsappClient.isReady) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp is not connected'
      });
    }

    Logger.info('WHATSAPP_ROUTE', `Validating number: ${phoneNumber}`);

    const result = await whatsappClient.isRegisteredUser(phoneNumber);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    Logger.error('WHATSAPP_ROUTE', 'Validation failed', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to validate number'
    });
  }
});

/**
 * GET /api/whatsapp/info
 * Get WhatsApp client info
 */
router.get('/info', async (req, res) => {
  try {
    const info = whatsappClient.getInfo();
    
    if (!info) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp is not connected'
      });
    }

    res.json({
      success: true,
      data: info
    });

  } catch (error) {
    Logger.error('WHATSAPP_ROUTE', 'Get info failed', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get WhatsApp info',
      error: error.message
    });
  }
});

module.exports = router;