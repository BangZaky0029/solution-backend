// =========================================
// FILE: controllers/whatsappController.js
// WhatsApp Bot Controller
// =========================================

const whatsappClient = require('../utils/whatsappClient');

/**
 * Get WhatsApp connection status
 */
exports.getStatus = (req, res) => {
  try {
    const status = whatsappClient.getStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error getting WhatsApp status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get WhatsApp status',
      error: error.message
    });
  }
};

/**
 * Get QR Code for WhatsApp connection
 */
exports.getQRCode = (req, res) => {
  try {
    const { qrCode, status } = whatsappClient.getStatus();
    
    if (status === 'ready') {
      return res.json({
        success: true,
        status: 'ready',
        message: 'WhatsApp is already connected'
      });
    }

    if (!qrCode && status !== 'ready') {
      return res.json({
        success: true,
        status: status,
        message: 'Generating QR code...',
        qrCode: null
      });
    }

    res.json({
      success: true,
      status: status,
      qrCode: qrCode,
      message: 'Scan QR code with WhatsApp'
    });

  } catch (error) {
    console.error('Error getting QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get QR code',
      error: error.message
    });
  }
};

/**
 * Restart WhatsApp connection
 */
exports.restart = async (req, res) => {
  try {
    // Get Socket.IO instance from app
    const io = req.app.get('io');
    
    await whatsappClient.restart(io);

    res.json({
      success: true,
      message: 'WhatsApp client restarting...'
    });
  } catch (error) {
    console.error('Error restarting WhatsApp:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restart WhatsApp',
      error: error.message
    });
  }
};

/**
 * Disconnect WhatsApp
 */
exports.disconnect = async (req, res) => {
  try {
    await whatsappClient.disconnect();

    res.json({
      success: true,
      message: 'WhatsApp disconnected successfully'
    });
  } catch (error) {
    console.error('Error disconnecting WhatsApp:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect WhatsApp',
      error: error.message
    });
  }
};

/**
 * Send test message (for admin testing)
 */
exports.sendTestMessage = async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }

    if (!whatsappClient.isReady) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp is not connected. Please connect first.'
      });
    }

    // Format phone number
    let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (!formattedNumber.startsWith('62')) {
      if (formattedNumber.startsWith('0')) {
        formattedNumber = '62' + formattedNumber.substring(1);
      } else {
        formattedNumber = '62' + formattedNumber;
      }
    }

    const chatId = formattedNumber + '@c.us';

    // Check if number is registered
    const isRegistered = await whatsappClient.client.isRegisteredUser(chatId);
    
    if (!isRegistered) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is not registered on WhatsApp'
      });
    }

    // Send message
    await whatsappClient.client.sendMessage(chatId, message);

    res.json({
      success: true,
      message: 'Test message sent successfully',
      to: formattedNumber
    });

  } catch (error) {
    console.error('Error sending test message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test message',
      error: error.message
    });
  }
};

/**
 * Validate phone number on WhatsApp
 */
exports.validateNumber = async (req, res) => {
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

    // Format phone number
    let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (!formattedNumber.startsWith('62')) {
      if (formattedNumber.startsWith('0')) {
        formattedNumber = '62' + formattedNumber.substring(1);
      } else {
        formattedNumber = '62' + formattedNumber;
      }
    }

    const chatId = formattedNumber + '@c.us';

    // Check if number is registered
    const isRegistered = await whatsappClient.client.isRegisteredUser(chatId);

    res.json({
      success: true,
      isValid: isRegistered,
      formattedNumber: formattedNumber,
      message: isRegistered 
        ? 'Number is registered on WhatsApp' 
        : 'Number is not registered on WhatsApp'
    });

  } catch (error) {
    console.error('Error validating number:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate phone number',
      error: error.message
    });
  }
};