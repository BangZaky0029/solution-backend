// C:\codingVibes\nuansasolution\.mainweb\payments\solution-backend\utils\whatsappClient.js

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const Logger = require('./logger');
const fs = require('fs');
const path = require('path');
const SESSION_PATH = path.join(__dirname, '../.wwebjs_auth/session-gateway-solution');

class WhatsAppClient {
  constructor() {
    this.client = null;
    this.io = null;
    this.isReady = false;
    this.qrCode = null;
    this.currentStatus = 'disconnected';
    this.retryCount = 0;
    this.maxRetries = 3;
  }

  async checkExistingSession(removeIfExists = false) {
    if (fs.existsSync(SESSION_PATH)) {
      Logger.warn('WHATSAPP', `Existing session folder found: ${SESSION_PATH}`);
      if (removeIfExists) {
        Logger.info('WHATSAPP', 'Old session folder removed.');
      }
    }
  }


  /**
   * Initialize WhatsApp Client
   * @param {Object} io - Socket.IO instance
   */
  async initialize(io) {
    if (this.client && this.isReady) {
      Logger.info('WHATSAPP', 'Client already initialized and ready');
      return;
    }


    if (!io) throw new Error('Socket.IO instance required');
    this.io = io;

    try {
      Logger.info('WHATSAPP', 'Creating WhatsApp client...');

      this.client = new Client({
        authStrategy: new LocalAuth({ clientId: 'gateway-solution' }),
        puppeteer: {
          headless: true,
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

      this.setupEventHandlers();
      Logger.info('WHATSAPP', 'Initializing WhatsApp client...');
      await this.client.initialize();
      Logger.info('WHATSAPP', 'Client initialized successfully');

    } catch (error) {
      Logger.error('WHATSAPP', `Initialization error (retryCount: ${this.retryCount})`, error);
      this.handleInitError(error);
    }
  }

  /**
   * Setup all event handlers
   */
  setupEventHandlers() {
    this.client.on('qr', async (qr) => {
      try {
        this.currentStatus = 'qr';
        this.qrCode = await qrcode.toDataURL(qr);
        this.broadcastStatus({ status: 'qr', qr: this.qrCode, message: 'Scan QR code to connect' });
      } catch (error) {
        Logger.error('WHATSAPP', 'QR generation error', error);
      }
    });

    this.client.on('ready', () => {
      this.isReady = true;
      this.qrCode = null;
      this.currentStatus = 'ready';
      this.retryCount = 0;
      this.broadcastStatus({ status: 'ready', message: 'WhatsApp connected successfully', info: this.getInfo() });
      Logger.info('WHATSAPP', 'Client is ready');
    });

    this.client.on('authenticated', () => {
      this.currentStatus = 'authenticated';
      this.broadcastStatus({ status: 'authenticated', message: 'Authentication successful' });
    });

    this.client.on('auth_failure', () => {
      this.isReady = false;
      this.currentStatus = 'auth_failure';
      this.broadcastStatus({ status: 'auth_failure', message: 'Authentication failed. Please rescan QR.' });
    });

    this.client.on('disconnected', (reason) => {
      this.isReady = false;
      this.qrCode = null;
      this.currentStatus = 'disconnected';
      this.broadcastStatus({ status: 'disconnected', message: 'WhatsApp disconnected', reason });
      setTimeout(() => this.restart(), 5000);
    });

    this.client.on('error', (error) => {
      Logger.error('WHATSAPP', 'Client error', error);
    });

    this.client.on('message', (msg) => {
      Logger.info('WHATSAPP', `Message from ${msg.from}: ${msg.body.substring(0, 50)}`);
    });
  }

  /**
   * Broadcast status to all connected Socket.IO clients
   */
  broadcastStatus(data) {
    if (!this.io) {
        Logger.warn('WHATSAPP', `Cannot broadcast status "${data.status}" - Socket.IO not ready`);
        return;
    }
    const payload = { ...data };
    if (this.qrCode) payload.qr = this.qrCode;
    this.io.emit('whatsapp-status', payload);
    Logger.info('WHATSAPP', `Status broadcast: ${data.status}`);
}


  /**
   * Get current status
   */
  getStatus() {
    return {
      status: this.currentStatus,
      isReady: this.isReady,
      qrCode: this.qrCode,
      info: this.isReady && this.client ? this.client.info : null
    };
  }

  // ✅ Tambahkan getInfo() di sini
  getInfo() {
    if (!this.client || !this.isReady) return null;
    return this.client.info;
  }


  /**
   * Handle initialization errors
   */
  handleInitError(error) {
    this.retryCount++;

    if (error.message.includes('The browser is already running')) {
      Logger.error('WHATSAPP', 'Browser already running. Waiting 10s before retry...');
      setTimeout(() => this.restart(), 10000);
      return;
    }

    if (this.client) {
      this.client.removeAllListeners();
      this.client = null;
    }

    if (this.retryCount < this.maxRetries) {
      Logger.warn('WHATSAPP', `Retry ${this.retryCount}/${this.maxRetries} in 5 seconds...`);
      setTimeout(() => this.initialize(this.io), 5000);
    } else {
      this.currentStatus = 'failed';
      this.broadcastStatus({ status: 'failed', message: 'WhatsApp client disabled, manual restart required.' });
      Logger.error('WHATSAPP', 'Max retries reached. WhatsApp disabled.', error);
    }
  }


  /**
   * Restart WhatsApp client
   */
  async restart(removeSession = false) {
      Logger.info('WHATSAPP', 'Restarting client...');

      // Hanya hapus session kalau benar-benar diinginkan
      if (removeSession) await this.checkExistingSession(true);

      if (this.client) {
        this.client.removeAllListeners();
        try { await this.client.destroy(); } 
        catch(e) { Logger.warn('WHATSAPP', 'Failed to destroy client, ignoring...', e); }
        this.client = null;
      }

      this.isReady = false;
      this.qrCode = null;
      this.currentStatus = 'restarting';
      this.broadcastStatus({ status: 'restarting', message: 'Restarting WhatsApp client...' });

      setTimeout(() => this.initialize(this.io), 3000);
    }



  /**
   * Format phone number to WhatsApp format
   */
  formatPhoneNumber(phoneNumber) {
    let cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
    else if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;
    return cleaned + '@c.us';
  }

  /**
   * Send WhatsApp message
   */
  async sendMessage(phoneNumber, message) {
    try {
      if (!this.isReady) throw new Error('WhatsApp client is not ready');
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      const sentMessage = await this.client.sendMessage(formattedNumber, message);
      Logger.info('WHATSAPP', `✅ Message sent successfully to ${phoneNumber}`);
      return { success: true, messageId: sentMessage.id._serialized, timestamp: sentMessage.timestamp, to: formattedNumber };
    } catch (err) {
      Logger.error('WHATSAPP', `Send message failed to ${phoneNumber}`, err);
      return { success: false, error: err.message };
    }
    }


  /**
   * Check if number is registered
   */
  async isRegisteredUser(phoneNumber) {
    try {
      if (!this.isReady) throw new Error('WhatsApp client is not ready');
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      const isRegistered = await this.client.isRegisteredUser(formattedNumber);
      return { isValid: isRegistered, formattedNumber: formattedNumber.replace('@c.us', ''), message: isRegistered ? 'Registered' : 'Not registered' };
    } catch (err) {
      Logger.error('WHATSAPP', `Validation failed for ${phoneNumber}`, err);
      return { success: false, error: err.message };
    }
  }

}

module.exports = new WhatsAppClient();
