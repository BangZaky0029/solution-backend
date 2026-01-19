// =========================================
// FILE: utils/whatsappClient.js - COMPLETE FIX
// WhatsApp Client with whatsapp-web.js
// =========================================

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const Logger = require('./logger');
const path = require('path');
const fs = require('fs');

class WhatsAppClient {
  constructor() {
    this.client = null;
    this.io = null;
    this.isReady = false;
    this.qrCode = null;
    this.currentStatus = 'disconnected';
    this.retryCount = 0;
    this.maxRetries = 3;
    this.sessionPath = '/var/www/solution-backend/whatsapp-session';
  }

  /**
   * Initialize WhatsApp Client
   * @param {Object} io - Socket.IO instance
   */
  async initialize(io) {
    this.io = io;

    try {
      Logger.info('WHATSAPP', 'Creating WhatsApp client...');

      // Ensure session directory exists
      if (!fs.existsSync(this.sessionPath)) {
        fs.mkdirSync(this.sessionPath, { recursive: true });
      }

      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: 'gateway-solution',
          dataPath: this.sessionPath
        }),
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
      
      Logger.info('WHATSAPP', 'Initializing client...');
      await this.client.initialize();
      
    } catch (error) {
      Logger.error('WHATSAPP', 'Initialization error', error);
      this.handleInitError(error);
    }
  }

  /**
   * Setup all event handlers
   */
  setupEventHandlers() {
    // QR Code event
    this.client.on('qr', async (qr) => {
      try {
        Logger.info('WHATSAPP', 'QR Code generated');
        this.currentStatus = 'qr';
        this.qrCode = await qrcode.toDataURL(qr);
        
        this.broadcastStatus({
          status: 'qr',
          qr: this.qrCode,
          message: 'Scan QR code to connect'
        });
      } catch (error) {
        Logger.error('WHATSAPP', 'QR generation error', error);
      }
    });

    // Ready event
    this.client.on('ready', () => {
      Logger.info('WHATSAPP', '✅ Client is ready!');
      this.isReady = true;
      this.qrCode = null;
      this.currentStatus = 'ready';
      this.retryCount = 0;

      this.broadcastStatus({
        status: 'ready',
        message: 'WhatsApp connected successfully',
        info: this.client.info
      });
    });

    // Authenticated event
    this.client.on('authenticated', () => {
      Logger.info('WHATSAPP', 'Client authenticated');
      this.currentStatus = 'authenticated';
      
      this.broadcastStatus({
        status: 'authenticated',
        message: 'Authentication successful'
      });
    });

    // Auth failure event
    this.client.on('auth_failure', (msg) => {
      Logger.error('WHATSAPP', 'Authentication failed', msg);
      this.currentStatus = 'auth_failure';
      this.isReady = false;
      
      this.broadcastStatus({
        status: 'disconnected',
        message: 'Authentication failed',
        error: msg
      });
    });

    // Disconnected event
    this.client.on('disconnected', (reason) => {
      Logger.warn('WHATSAPP', 'Client disconnected', reason);
      this.isReady = false;
      this.qrCode = null;
      this.currentStatus = 'disconnected';
      
      this.broadcastStatus({
        status: 'disconnected',
        message: 'WhatsApp disconnected',
        reason: reason
      });
    });

    // Loading screen event
    this.client.on('loading_screen', (percent, message) => {
      Logger.info('WHATSAPP', `Loading: ${percent}% - ${message}`);
    });

    // Message event (for debugging)
    this.client.on('message', async (msg) => {
      Logger.info('WHATSAPP', `Message from ${msg.from}: ${msg.body.substring(0, 50)}`);
    });

    // Error event
    this.client.on('error', (error) => {
      Logger.error('WHATSAPP', 'Client error', error);
    });
  }

  /**
   * Broadcast status to all connected Socket.IO clients
   * @param {Object} data - Status data
   */
  broadcastStatus(data) {
    if (this.io) {
      this.io.emit('whatsapp-status', data);
      if (data.qr) {
        this.io.emit('whatsapp-qr', data);
      }
      Logger.info('WHATSAPP', `Status broadcast: ${data.status}`)
    }
  }

  /**
   * Get current status (CRITICAL METHOD)
   * @returns {Object} Current status object
   */
  getStatus() {
    return {
      status: this.currentStatus,
      isReady: this.isReady,
      qrCode: this.qrCode,
      info: this.isReady && this.client ? this.client.info : null
    };
  }

  /**
   * Handle initialization errors
   * @param {Error} error - Error object
   */
  handleInitError(error) {
    this.retryCount++;
    
    if (this.retryCount < this.maxRetries) {
      Logger.warn('WHATSAPP', `Retry ${this.retryCount}/${this.maxRetries} in 5 seconds...`);
      setTimeout(() => this.initialize(this.io), 5000);
    } else {
      Logger.error('WHATSAPP', 'Max retries reached. WhatsApp disabled.');
      this.currentStatus = 'failed';
      this.broadcastStatus({
        status: 'failed',
        message: 'Failed to initialize after multiple attempts',
        error: error.message
      });
    }
  }

  /**
   * Format phone number to WhatsApp format
   * @param {string} phoneNumber - Phone number to format
   * @returns {string} Formatted number
   */
  formatPhoneNumber(phoneNumber) {
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Handle Indonesian numbers
    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.substring(1);
    } else if (!cleaned.startsWith('62')) {
      cleaned = '62' + cleaned;
    }
    
    return cleaned + '@c.us';
  }

  /**
   * Check if number is registered on WhatsApp
   * @param {string} phoneNumber - Phone number to check
   * @returns {Promise<Object>} Validation result
   */
  async isRegisteredUser(phoneNumber) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      const isRegistered = await this.client.isRegisteredUser(formattedNumber);
      
      return {
        isValid: isRegistered,
        formattedNumber: formattedNumber.replace('@c.us', ''),
        message: isRegistered 
          ? 'Number is registered on WhatsApp' 
          : 'Number is not registered on WhatsApp'
      };
    } catch (error) {
      Logger.error('WHATSAPP', 'Validation error', error);
      throw new Error('Failed to validate number');
    }
  }

  /**
   * Send WhatsApp message
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - Message to send
   * @returns {Promise<Object>} Send result
   */
  async sendMessage(phoneNumber, message) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready. Please wait for connection.');
    }

    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      
      Logger.info('WHATSAPP', `Sending message to ${formattedNumber}`);
      
      const sentMessage = await this.client.sendMessage(formattedNumber, message);
      
      Logger.info('WHATSAPP', `✅ Message sent successfully to ${phoneNumber}`);
      
      return {
        success: true,
        messageId: sentMessage.id._serialized,
        timestamp: sentMessage.timestamp,
        to: formattedNumber
      };
    } catch (error) {
      Logger.error('WHATSAPP', `Failed to send message to ${phoneNumber}`, error);
      throw new Error(`Failed to send WhatsApp message: ${error.message}`);
    }
  }

  /**
   * Restart WhatsApp client
   */
  async restart() {
    try {
      Logger.info('WHATSAPP', 'Restarting client...');
      
      if (this.client) {
        await this.client.destroy();
      }
      
      this.isReady = false;
      this.qrCode = null;
      this.currentStatus = 'restarting';
      this.retryCount = 0;
      
      this.broadcastStatus({
        status: 'restarting',
        message: 'Restarting WhatsApp client...'
      });
      
      // Reinitialize after 2 seconds
      setTimeout(() => {
        this.client = null;
        this.initialize(this.io);
      }, 5000);

      
      return { success: true, message: 'Restart initiated' };
    } catch (error) {
      Logger.error('WHATSAPP', 'Restart error', error);
      throw new Error('Failed to restart WhatsApp client');
    }
  }

  /**
   * Disconnect WhatsApp client
   */
  async disconnect() {
    try {
      Logger.info('WHATSAPP', 'Disconnecting client...');
      
      if (this.client) {
        await this.client.logout();
        await this.client.destroy();
      }
      
      this.isReady = false;
      this.qrCode = null;
      this.currentStatus = 'disconnected';
      
      this.broadcastStatus({
        status: 'disconnected',
        message: 'WhatsApp disconnected successfully'
      });
      
      return { success: true, message: 'Disconnected successfully' };
    } catch (error) {
      Logger.error('WHATSAPP', 'Disconnect error', error);
      throw new Error('Failed to disconnect WhatsApp client');
    }
  }

  /**
   * Get client info
   * @returns {Object} Client information
   */
  getInfo() {
    if (!this.isReady || !this.client) {
      return null;
    }
    
    return this.client.info;
  }
}

// Export singleton instance
const whatsappClient = new WhatsAppClient();
module.exports = whatsappClient;