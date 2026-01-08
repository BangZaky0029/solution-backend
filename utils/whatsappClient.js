// =========================================
// FILE: utils/whatsappClient.js
// WhatsApp Client Setup with qrcode-terminal
// =========================================

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

class WhatsAppClient {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.qrCode = null;
    this.status = 'disconnected'; // disconnected, qr, connecting, ready
    this.io = null; // Socket.IO instance
  }

  /**
   * Initialize WhatsApp client
   */
  initialize(io) {
    this.io = io;

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: './whatsapp-session'
      }),
      puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
        }

    });

    // QR Code generated
    this.client.on('qr', async (qr) => {
      console.log('📱 QR Code received, scan to connect WhatsApp');
      this.status = 'qr';
      
      try {
        // Generate QR code as data URL
        this.qrCode = await qrcode.toDataURL(qr);
        
        // Emit to all connected admin clients
        if (this.io) {
          this.io.emit('whatsapp-qr', {
            qr: this.qrCode,
            status: 'qr'
          });
        }
      } catch (err) {
        console.error('Error generating QR code:', err);
      }
    });

    // Client is ready
    this.client.on('ready', () => {
      console.log('✅ WhatsApp Client is ready!');
      this.isReady = true;
      this.status = 'ready';
      this.qrCode = null;

      if (this.io) {
        this.io.emit('whatsapp-status', {
          status: 'ready',
          message: 'WhatsApp connected successfully'
        });
      }
    });

    // Authentication successful
    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp authenticated');
      this.status = 'connecting';
      
      if (this.io) {
        this.io.emit('whatsapp-status', {
          status: 'connecting',
          message: 'Authenticating...'
        });
      }
    });

    // Authentication failure
    this.client.on('auth_failure', (msg) => {
      console.error('❌ WhatsApp authentication failed:', msg);
      this.status = 'disconnected';
      this.isReady = false;

      if (this.io) {
        this.io.emit('whatsapp-status', {
          status: 'error',
          message: 'Authentication failed. Please try again.'
        });
      }
    });

    // Client disconnected
    this.client.on('disconnected', (reason) => {
      console.log('⚠️ WhatsApp Client disconnected:', reason);
      this.status = 'disconnected';
      this.isReady = false;
      this.qrCode = null;

      if (this.io) {
        this.io.emit('whatsapp-status', {
          status: 'disconnected',
          message: 'WhatsApp disconnected'
        });
      }
    });

    // Initialize the client
    this.client.initialize();
  }

  /**
   * Send OTP message to WhatsApp number
   */
  async sendOTP(phoneNumber, otpCode, userName) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      // Format phone number (remove +, spaces, dashes)
      let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
      
      // Add country code if not present (default to Indonesia)
      if (!formattedNumber.startsWith('62')) {
        if (formattedNumber.startsWith('0')) {
          formattedNumber = '62' + formattedNumber.substring(1);
        } else {
          formattedNumber = '62' + formattedNumber;
        }
      }

      // WhatsApp ID format
      const chatId = formattedNumber + '@c.us';

      // Check if number exists on WhatsApp
      const isRegistered = await this.client.isRegisteredUser(chatId);
      
      if (!isRegistered) {
        throw new Error('Number is not registered on WhatsApp');
      }

      // Send OTP message
      const message = `🔐 *Gateway SOLUTION - Verification Code*\n\n` +
                     `Hello ${userName || 'User'}! 👋\n\n` +
                     `Your OTP verification code is:\n\n` +
                     `*${otpCode}*\n\n` +
                     `⏰ This code is valid for 5 minutes.\n` +
                     `🔒 Please do not share this code with anyone.\n\n` +
                     `If you didn't request this code, please ignore this message.\n\n` +
                     `_Gateway SOLUTION Team_`;

      await this.client.sendMessage(chatId, message);

      console.log(`✅ OTP sent to ${formattedNumber}`);
      return {
        success: true,
        message: 'OTP sent successfully',
        formattedNumber
      };

    } catch (error) {
      console.error('❌ Error sending OTP:', error);
      throw error;
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      status: this.status,
      isReady: this.isReady,
      qrCode: this.qrCode
    };
  }

  /**
   * Disconnect WhatsApp client
   */
  async disconnect() {
    if (this.client) {
      await this.client.destroy();
      this.isReady = false;
      this.status = 'disconnected';
      this.qrCode = null;
      console.log('🔌 WhatsApp Client disconnected');
    }
  }

  /**
   * Restart WhatsApp client
   */
  async restart(io) {
    await this.disconnect();
    setTimeout(() => {
      this.initialize(io);
    }, 2000);
  }
}

// Export singleton instance
const whatsappClient = new WhatsAppClient();
module.exports = whatsappClient;