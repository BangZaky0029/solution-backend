// =========================================
// FILE: utils/whatsappClient.js - FIXED
// Socket.IO Instance Preservation
// =========================================

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const Logger = require('./logger');
const fs = require('fs');
const path = require('path');

const SESSION_PATH = path.join(__dirname, '../.wwebjs_auth/session-gateway-solution');

class WhatsAppClient {
  constructor() {
    this.client = null;
    this.io = null; // ✅ PRESERVED across restarts
    this.isReady = false;
    this.qrCode = null;
    this.currentStatus = 'disconnected';
    this.retryCount = 0;
    this.maxRetries = 3;
    this.isRestarting = false;
    this.isInitializing = false;
  }

  /**
   * ✅ Check existing session folder
   */
  async checkExistingSession(removeIfExists = false) {
    if (fs.existsSync(SESSION_PATH)) {
      Logger.warn('WHATSAPP', `Existing session folder found: ${SESSION_PATH}`);
      if (removeIfExists) {
        try {
          fs.rmSync(SESSION_PATH, { recursive: true, force: true });
          Logger.info('WHATSAPP', 'Old session folder removed.');
        } catch (err) {
          Logger.warn('WHATSAPP', 'Failed to remove old session folder', err);
        }
      }
    }
  }

  /**
   * ✅ FIXED: Initialize WhatsApp Client
   */
  async initialize(io) {
    if (this.isInitializing) {
      Logger.warn('WHATSAPP', 'Already initializing, skipping...');
      return;
    }
    
    this.isInitializing = true;

    try {
      await this.checkExistingSession(false);

      if (this.client && this.isReady) {
        Logger.info('WHATSAPP', 'Client already initialized and ready');
        this.isInitializing = false;
        return;
      }

      // ✅ FIX: Save Socket.IO instance if provided
      if (io) {
        this.io = io;
        Logger.info('WHATSAPP', 'Socket.IO instance saved');
      }

      // ✅ FIX: Validate Socket.IO
      if (!this.io) {
        throw new Error('Socket.IO instance required for initialization');
      }

      Logger.info('WHATSAPP', 'Creating WhatsApp client...');

      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: 'gateway-solution',
          dataPath: '/var/www/solution-backend/.wwebjs_auth'
        }),
        puppeteer: {
          headless: 'new',
          executablePath: '/usr/bin/google-chrome',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--single-process'
          ],
          dumpio: false
        }
      });

      this.setupEventHandlers();

      Logger.info('WHATSAPP', 'Initializing WhatsApp client...');
      await this.client.initialize();

      Logger.info('WHATSAPP', 'Client initialized successfully');

    } catch (error) {
      Logger.error(
        'WHATSAPP',
        `Initialization error (retryCount: ${this.retryCount})`,
        error
      );
      this.handleInitError(error);

    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * ✅ Setup event handlers
   */
  setupEventHandlers() {
    this.client.on('qr', async (qr) => {
      try {
        this.currentStatus = 'qr';
        this.qrCode = await qrcode.toDataURL(qr);
        
        Logger.info('WHATSAPP', '📱 QR Code generated');
        
        this.broadcastStatus({
          status: 'qr',
          qr: this.qrCode,
          message: 'Scan QR code to connect'
        });
      } catch (error) {
        Logger.error('WHATSAPP', 'QR generation error', error);
      }
    });

    this.client.on('ready', () => {
      this.isReady = true;
      this.qrCode = null;
      this.currentStatus = 'ready';
      this.retryCount = 0;
      
      const info = this.getInfo();
      
      this.broadcastStatus({
        status: 'ready',
        message: 'WhatsApp connected successfully',
        info: info
      });
      
      Logger.info('WHATSAPP', '✅ Client is ready', { 
        phone: info?.wid?.user || 'unknown' 
      });
    });

    this.client.on('authenticated', () => {
      this.currentStatus = 'authenticated';
      this.broadcastStatus({
        status: 'authenticated',
        message: 'Authentication successful'
      });
      Logger.info('WHATSAPP', '🔐 Authenticated');
    });

    this.client.on('auth_failure', async (error) => {
      this.isReady = false;
      this.currentStatus = 'auth_failure';
      
      Logger.error('WHATSAPP', 'Authentication failed', error);
      
      this.broadcastStatus({
        status: 'auth_failure',
        message: 'Authentication failed. Removing session and restarting...'
      });
      
      // Restart with session removal
      await this.restart(true);
    });

    this.client.on('disconnected', async (reason) => {
      this.isReady = false;
      this.qrCode = null;
      this.currentStatus = 'disconnected';
      
      Logger.warn('WHATSAPP', `Disconnected: ${reason}`);
      
      this.broadcastStatus({
        status: 'disconnected',
        message: 'WhatsApp disconnected',
        reason
      });
      
      // Auto-restart after 5 seconds
      setTimeout(async () => {
        if (!this.isRestarting) {
          await this.restart();
        }
      }, 5000);
    });

    this.client.on('error', (error) => {
      Logger.error('WHATSAPP', 'Client error', error);
    });

    this.client.on('message', (msg) => {
      Logger.info('WHATSAPP', `📨 Message from ${msg.from}: ${msg.body.substring(0, 50)}...`);
    });
  }

  /**
   * ✅ Broadcast status to all connected clients
   */
  broadcastStatus(data) {
    if (!this.io) {
      Logger.warn('WHATSAPP', `Cannot broadcast status "${data.status}" - Socket.IO not available`);
      return;
    }

    const payload = {
      ...data,
      timestamp: new Date().toISOString()
    };

    if (this.qrCode) {
      payload.qr = this.qrCode;
    }

    this.io.emit('whatsapp-status', payload);
    Logger.info('WHATSAPP', `📡 Broadcast: ${data.status}`);
  }

  /**
   * ✅ Get current status
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
   * ✅ Get WhatsApp info
   */
  getInfo() {
    if (!this.client || !this.isReady) return null;
    try {
      return this.client.info;
    } catch (error) {
      Logger.error('WHATSAPP', 'Failed to get info', error);
      return null;
    }
  }

  /**
   * ✅ Handle initialization errors
   */
  handleInitError(error) {
    this.retryCount++;

    if (error.message.includes('The browser is already running')) {
      Logger.warn('WHATSAPP', 'Browser already running. Waiting 10s before retry...');
      setTimeout(() => this.restart(), 10000);
      return;
    }

    if (error.message.includes('Target closed') || error.message.includes('detached Frame')) {
      Logger.warn('WHATSAPP', 'Browser closed unexpectedly. Restarting...');
      this.restart();
      return;
    }

    if (this.retryCount < this.maxRetries) {
      const delay = this.retryCount * 3000; // Exponential backoff
      Logger.warn('WHATSAPP', `Retry ${this.retryCount}/${this.maxRetries} in ${delay/1000}s...`);
      
      setTimeout(() => {
        // ✅ FIX: Don't pass io again, use stored this.io
        this.initialize();
      }, delay);
    } else {
      this.currentStatus = 'failed';
      this.broadcastStatus({
        status: 'failed',
        message: 'WhatsApp client failed after maximum retries. Please restart manually.'
      });
      Logger.error('WHATSAPP', 'Max retries reached. WhatsApp disabled.', error);
    }
  }

  /**
   * ✅ FIXED: Destroy client without clearing Socket.IO
   */
  async destroyClient() {
    if (this.client) {
      try {
        this.client.removeAllListeners();
        await this.client.destroy();
        Logger.info('WHATSAPP', 'Client destroyed successfully');
      } catch (err) {
        Logger.warn('WHATSAPP', 'Failed to destroy client gracefully', err);
      } finally {
        this.client = null;
        this.isReady = false;
        this.qrCode = null;
        this.currentStatus = 'disconnected';
        // ✅ FIX: DO NOT CLEAR this.io here!
        // this.io stays preserved for restart
      }
    }
  }

  /**
   * ✅ FIXED: Restart WhatsApp client
   */
  async restart(removeSession = false) {
    if (this.isRestarting) {
      Logger.warn('WHATSAPP', 'Already restarting, skipping duplicate request');
      return { success: false, message: 'Already restarting' };
    }

    this.isRestarting = true;
    Logger.info('WHATSAPP', '🔄 Restarting client...', { removeSession });

    // Reset retry counter
    this.retryCount = 0;

    // Remove session if requested
    if (removeSession && fs.existsSync(SESSION_PATH)) {
      try {
        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        Logger.info('WHATSAPP', '🗑️ Session folder removed');
      } catch (err) {
        Logger.warn('WHATSAPP', 'Failed to remove session folder', err);
      }
    }

    // Destroy current client
    await this.destroyClient();

    // Broadcast restarting status
    this.currentStatus = 'restarting';
    this.broadcastStatus({
      status: 'restarting',
      message: 'Restarting WhatsApp client...'
    });

    // Wait before reinitializing
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      // ✅ FIX: Don't pass io, use stored this.io
      await this.initialize();
      
      this.isRestarting = false;
      
      return {
        success: true,
        message: 'WhatsApp client restart initiated'
      };
      
    } catch (err) {
      Logger.error('WHATSAPP', 'Failed to initialize after restart', err);
      this.isRestarting = false;
      
      return {
        success: false,
        message: 'Failed to restart WhatsApp client',
        error: err.message
      };
    }
  }

  /**
   * ✅ Disconnect WhatsApp
   */
  async disconnect() {
    Logger.info('WHATSAPP', 'Disconnecting WhatsApp...');

    try {
      if (this.client) {
        await this.client.logout();
        await this.destroyClient();
      }

      // Remove session
      if (fs.existsSync(SESSION_PATH)) {
        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        Logger.info('WHATSAPP', 'Session removed');
      }

      this.currentStatus = 'disconnected';
      this.broadcastStatus({
        status: 'disconnected',
        message: 'WhatsApp disconnected successfully'
      });

      return {
        success: true,
        message: 'WhatsApp disconnected successfully'
      };

    } catch (error) {
      Logger.error('WHATSAPP', 'Disconnect error', error);
      return {
        success: false,
        message: 'Failed to disconnect WhatsApp',
        error: error.message
      };
    }
  }

  /**
   * ✅ Format phone number
   */
  formatPhoneNumber(phoneNumber) {
    let cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.substring(1);
    } else if (!cleaned.startsWith('62')) {
      cleaned = '62' + cleaned;
    }
    return cleaned + '@c.us';
  }

  /**
   * ✅ Send message with retry logic
   */
  async sendMessage(phoneNumber, message, attempt = 0) {
    if (!this.isReady) {
      const error = 'WhatsApp client is not ready';
      Logger.error('WHATSAPP', error);
      throw new Error(error);
    }

    const formattedNumber = this.formatPhoneNumber(phoneNumber);

    try {
      // Small delay for stability
      await new Promise(resolve => setTimeout(resolve, 1000));

      const sentMessage = await this.client.sendMessage(formattedNumber, message);
      
      Logger.info('WHATSAPP', `✅ Message sent to ${phoneNumber}`, {
        messageId: sentMessage.id._serialized
      });

      return {
        success: true,
        messageId: sentMessage.id._serialized,
        timestamp: sentMessage.timestamp,
        to: formattedNumber
      };

    } catch (err) {
      Logger.error('WHATSAPP', `Failed to send message to ${phoneNumber}`, err);

      // Retry for temporary errors
      if ((err.message.includes('markedUnread') || err.message.includes('detached Frame')) && attempt < 2) {
        Logger.warn('WHATSAPP', 'Temporary error detected, retrying...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.sendMessage(phoneNumber, message, attempt + 1);
      }

      throw new Error(err.message || 'Failed to send message');
    }
  }

  /**
   * ✅ Validate if number is registered on WhatsApp
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
        message: isRegistered ? 'Number is registered on WhatsApp' : 'Number is not registered on WhatsApp'
      };

    } catch (err) {
      Logger.error('WHATSAPP', `Validation failed for ${phoneNumber}`, err);
      throw new Error(err.message || 'Failed to validate number');
    }
  }
}

// ✅ Export singleton instance
module.exports = new WhatsAppClient();