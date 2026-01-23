// routes/whatsapp.js
const express = require('express');
const router = express.Router();
const whatsappClient = require('../utils/whatsappClient');
const Logger = require('../utils/logger');
const PhoneValidator = require('../utils/phoneValidator');
const { WhatsAppTemplates } = require('../utils/whatsappTemplates');

// Health check
router.get('/health', async (req, res) => {
  const result = await whatsappClient.healthCheck();
  res.json(result);
});

// Restart WA
router.post('/restart', async (req, res) => {
  const io = req.app.get('io');

  try {
    await whatsappClient.restart(io);
    res.json({
      success: true,
      message: 'WhatsApp restarting',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// 🔥 NEW: Send message manually
router.post('/send-message', async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: 'Nomor dan pesan diperlukan',
      });
    }

    // Validate phone
    const phoneValidation = PhoneValidator.validate(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        message: phoneValidation.message,
      });
    }

    if (!whatsappClient.isReady) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp bot is not connected',
      });
    }

    // Check if number is registered
    const isRegistered = await whatsappClient.checkNumberRegistered(phoneValidation.normalized);
    if (!isRegistered) {
      return res.status(400).json({
        success: false,
        message: 'Nomor WhatsApp tidak terdaftar di WhatsApp',
      });
    }

    // Send message
    const formattedMessage = WhatsAppTemplates.customMessage(message);
    await whatsappClient.sendMessage(phoneValidation.normalized, formattedMessage);Logger.whatsapp('MANUAL_SEND', `Message sent to ${phoneValidation.normalized}`, { message });res.json({
      success: true,
      message: 'Pesan berhasil dikirim',
      sentTo: PhoneValidator.formatDisplay(phoneValidation.normalized),
    });} catch (error) {
    Logger.error('WHATSAPP', 'Failed to send message', error);
      res.status(500).json({
      success: false,
      message: error.message,
    });
    }
    });module.exports = router;