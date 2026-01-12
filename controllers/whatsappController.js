// =========================================
// FILE: controllers/whatsappController.js - FIXED
// WhatsApp Bot Controller (NO DIRECT CLIENT ACCESS)
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
    const { qrCode, status, isReady } = whatsappClient.getStatus();
    
    if (status === 'ready' || isReady) {
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
 * ✅ FIXED: Send test message (using abstraction API)
 */
exports.sendTestMessage = async (req, res) => {
  try {
    let { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }

    // Check if WhatsApp is ready
    if (!whatsappClient.isReady) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp is not connected. Please connect first.'
      });
    }

    // Format phone number
    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (!phoneNumber.startsWith('62')) {
      if (phoneNumber.startsWith('0')) {
        phoneNumber = '62' + phoneNumber.substring(1);
      } else {
        phoneNumber = '62' + phoneNumber;
      }
    }

    // ✅ FIXED: Use abstraction API instead of direct client access
    await whatsappClient.sendMessage(phoneNumber, message);

    res.json({
      success: true,
      message: 'Test message sent successfully',
      to: phoneNumber
    });

  } catch (error) {
    console.error('Error sending test message:', error);
    
    // Handle specific errors
    if (error.message.includes('not registered')) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is not registered on WhatsApp'
      });
    }

    if (error.message.includes('not ready')) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp client is not ready'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to send test message',
      error: error.message
    });
  }
};

/**
 * ✅ FIXED: Validate phone number (using abstraction API)
 */
exports.validateNumber = async (req, res) => {
  try {
    let { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Check if WhatsApp is ready
    if (!whatsappClient.isReady) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp is not connected'
      });
    }

    // Format phone number
    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (!phoneNumber.startsWith('62')) {
      if (phoneNumber.startsWith('0')) {
        phoneNumber = '62' + phoneNumber.substring(1);
      } else {
        phoneNumber = '62' + phoneNumber;
      }
    }

    // ✅ FIXED: Use abstraction API instead of direct client access
    const isValid = await whatsappClient.validateNumber(phoneNumber);

    res.json({
      success: true,
      isValid: isValid,
      formattedNumber: phoneNumber,
      message: isValid 
        ? 'Number is registered on WhatsApp' 
        : 'Number is not registered on WhatsApp'
    });

  } catch (error) {
    console.error('Error validating number:', error);
    
    // Handle specific errors
    if (error.message.includes('not ready')) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp client is not ready'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to validate phone number',
      error: error.message
    });
  }
};