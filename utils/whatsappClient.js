// =========================================
// FILE: utils/whatsappClient.js - UPDATED
// Enhanced with Template Message Methods
// =========================================

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const Logger = require('./logger');
const { WhatsAppTemplates } = require('./whatsappTemplates'); 

class WhatsAppClient {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.qrCode = null;
    this.status = 'disconnected';
    this.io = null;
    this.initialized = false;
    this.initializing = false;
    this.manualDisconnect = false;
  }

  /**
   * Initialize WhatsApp client
   */
  initialize(io) {
    this.io = io;
    if (this.initializing || this.initialized) {
      Logger.whatsapp('SKIP_INIT', 'WhatsApp already initialized');
      return;
    }
    this.initializing = true;


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
        if (this.qrCode) return; // prevent duplicate QR

        Logger.whatsapp('QR_GENERATED', 'QR Code generated');
        this.status = 'qr';

        try {
          this.qrCode = await qrcode.toDataURL(qr);

          this.io?.emit('whatsapp-qr', {
            qr: this.qrCode,
            status: 'qr'
          });
        } catch (err) {
          Logger.error('WHATSAPP', 'Error generating QR code', err);
        }
      });


    // Client is ready
    this.client.on('ready', () => {
      Logger.whatsapp('READY', 'WhatsApp Client is ready');

      this.isReady = true;
      this.status = 'ready';
      this.qrCode = null;
      this.initialized = true;
      this.initializing = false;

      this.io?.emit('whatsapp-status', this.getStatus());
    });


    // Authentication successful
    this.client.on('authenticated', () => {
      Logger.whatsapp('AUTHENTICATED', 'WhatsApp authenticated');

      this.status = 'connecting';
      this.qrCode = null;
      this.initializing = false;

      this.io?.emit('whatsapp-status', this.getStatus());
    });



    // Authentication failure
    this.client.on('auth_failure', async (msg) => {
      Logger.error('WHATSAPP', 'Authentication failed', { message: msg });

      try {
        await this.client?.destroy();
      } catch (e) {
        Logger.error('WHATSAPP', 'Destroy failed', e);
      }

      this.client = null;
      this.status = 'disconnected';
      this.isReady = false;
      this.qrCode = null;
      this.initialized = false;
      this.initializing = false;

      this.io?.emit('whatsapp-status', {
        status: 'error',
        message: 'Authentication failed. Please try again.'
      });
    });


    // Client disconnected
    this.client.on('disconnected', (reason) => {
      Logger.whatsapp('DISCONNECTED', `WhatsApp disconnected: ${reason}`);

      this.status = 'disconnected';
      this.isReady = false;
      this.qrCode = null;
      this.initialized = false;

      this.io?.emit('whatsapp-status', this.getStatus());

      if (!this.initializing && !this.manualDisconnect) {
        setTimeout(() => {
          this.restart(this.io);
        }, 5000);
      }
    });


    // Initialize
    this.client.initialize();
    Logger.whatsapp('INITIALIZING', 'WhatsApp client initializing...');
    this.manualDisconnect = false;
  }

  /**
   * Format phone number to WhatsApp format
   */
  formatPhoneNumber(phoneNumber) {
    let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');

    if (!formattedNumber.startsWith('62')) {
      if (formattedNumber.startsWith('0')) {
        formattedNumber = '62' + formattedNumber.substring(1);
      } else {
        formattedNumber = '62' + formattedNumber;
      }
    }

    return formattedNumber;
  }

  /**
   * Send message to WhatsApp number
   */
  async sendMessage(phoneNumber, message) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }
    if (!message || !message.trim()) {
      throw new Error('Message is empty');
    }


    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      const chatId = formattedNumber + '@c.us';

      // Check if number exists
      const isRegistered = await this.client.isRegisteredUser(chatId);

      if (!isRegistered) {
        Logger.error('WHATSAPP', 'Number not registered on WhatsApp', { phoneNumber: formattedNumber });
        throw new Error('Number is not registered on WhatsApp');
      }

      // Send message
      await this.client.sendMessage(chatId, message);

      Logger.whatsapp('MESSAGE_SENT', `Message sent to ${formattedNumber}`);

      return {
        success: true,
        message: 'Message sent successfully',
        formattedNumber
      };

    } catch (error) {
      Logger.error('WHATSAPP', 'Error sending message', error);
      throw error;
    }
  }

  /**
   * Send OTP message (legacy support)
  */
  async sendOTP(phoneNumber, otpCode, userName) {
    const message = WhatsAppTemplates.registrationOTP(userName, otpCode);
    return this.sendMessage(phoneNumber, message);
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
    if (!this.client) return;

    try {
      await this.client.destroy();
    } catch (e) {
      Logger.error('WHATSAPP', 'Error on destroy', e);
    }

    this.client = null;
    this.isReady = false;
    this.status = 'disconnected';
    this.qrCode = null;
    this.initialized = false;
    this.initializing = false;
    this.manualDisconnect = true;

    Logger.whatsapp('DISCONNECT', 'WhatsApp Client disconnected');
  }


  /**
   * Restart WhatsApp client
   */
  async restart(io) {
    if (this.initializing) return;

    Logger.whatsapp('RESTART', 'Restarting WhatsApp client...');
    await this.disconnect();
    setTimeout(() => {
      this.initialize(io);
    }, 2000);
  }
}

// Export singleton instance
const whatsappClient = new WhatsAppClient();
module.exports = whatsappClient;