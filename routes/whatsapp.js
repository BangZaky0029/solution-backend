// =========================================
// FILE: routes/whatsapp.js - FIXED
// =========================================

const express = require('express');
const router = express.Router();
const whatsappClient = require('../utils/whatsappClient');
const Logger = require('../utils/logger');

router.get('/status', async (req, res) => {
  try {
    const status = whatsappClient.getStatus();
    res.json({
      success: true,
      status: status.status,
      isReady: status.isReady,
      qrCode: status.qrCode,
      info: status.info,
      hasSocketIO: status.hasSocketIO, // ✅ Debug
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('WHATSAPP_ROUTE', 'Get status error', error);
    res.status(500).json({ success: false, message: 'Failed to get status', error: error.message });
  }
});

router.post('/restart', async (req, res) => {
  try {
    Logger.info('WHATSAPP_ROUTE', 'Restart requested');
    
    // ✅ Get Socket.IO from app (if available)
    const io = req.app.get('io');
    
    if (io) {
      Logger.info('WHATSAPP_ROUTE', '✅ Socket.IO found in app');
      // ✅ Re-inject Socket.IO if needed
      if (!whatsappClient.io) {
        whatsappClient.io = io;
        Logger.info('WHATSAPP_ROUTE', '✅ Socket.IO re-injected');
      }
    } else {
      Logger.warn('WHATSAPP_ROUTE', '⚠️ Socket.IO NOT found in app');
    }
    
    const result = await whatsappClient.restart();
    res.json({ success: true, message: 'Restart initiated', data: result });
  } catch (error) {
    Logger.error('WHATSAPP_ROUTE', 'Restart failed', error);
    res.status(500).json({ success: false, message: 'Restart failed', error: error.message });
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    Logger.info('WHATSAPP_ROUTE', 'Disconnect requested');
    const result = await whatsappClient.disconnect();
    res.json({ success: true, message: 'Disconnected', data: result });
  } catch (error) {
    Logger.error('WHATSAPP_ROUTE', 'Disconnect failed', error);
    res.status(500).json({ success: false, message: 'Disconnect failed', error: error.message });
  }
});

router.post('/send-test', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    if (!phoneNumber || !message) {
      return res.status(400).json({ success: false, message: 'Phone and message required' });
    }
    if (!whatsappClient.isReady) {
      return res.status(503).json({ success: false, message: 'WhatsApp not connected' });
    }
    Logger.info('WHATSAPP_ROUTE', `Sending test to ${phoneNumber}`);
    const result = await whatsappClient.sendMessage(phoneNumber, message);
    res.json({ success: true, message: 'Sent', data: result });
  } catch (error) {
    Logger.error('WHATSAPP_ROUTE', 'Send test failed', error);
    res.status(500).json({ success: false, message: error.message || 'Send failed' });
  }
});

router.post('/validate-number', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone required' });
    }
    if (!whatsappClient.isReady) {
      return res.status(503).json({ success: false, message: 'WhatsApp not connected' });
    }
    Logger.info('WHATSAPP_ROUTE', `Validating: ${phoneNumber}`);
    const result = await whatsappClient.isRegisteredUser(phoneNumber);
    res.json({ success: true, ...result });
  } catch (error) {
    Logger.error('WHATSAPP_ROUTE', 'Validation failed', error);
    res.status(500).json({ success: false, message: error.message || 'Validation failed' });
  }
});

router.get('/info', async (req, res) => {
  try {
    const info = whatsappClient.getInfo();
    if (!info) {
      return res.status(503).json({ success: false, message: 'WhatsApp not connected' });
    }
    res.json({ success: true, data: info });
  } catch (error) {
    Logger.error('WHATSAPP_ROUTE', 'Get info failed', error);
    res.status(500).json({ success: false, message: 'Get info failed', error: error.message });
  }
});

module.exports = router;