const express = require('express');
const router = express.Router();
const whatsappClient = require('../utils/whatsappClient');

router.get('/whatsapp', (req, res) => {
  const status = whatsappClient.getStatus();

  res.json({
    service: 'whatsapp',
    status: status.status,
    isReady: status.isReady,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
