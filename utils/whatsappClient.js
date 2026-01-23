// =========================================
// FILE: utils/whatsappClient.js - CHROMIUM VERSION
// =========================================

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const Logger = require('./logger');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const SESSION_PATH = path.join(__dirname, '../.wwebjs_auth/session-gateway-solution');

class WhatsAppClient {
  constructor() {
    this.client = null;
    this.io = null;
    this.isReady = false;
    this.qrCode = null;
    this.currentStatus = 'disconnected';
    this.retryCount = 0;
    this.maxRetries = 5; // Increase retries
    this.isRestarting = false;
    this.isInitializing = false;
  }

  /**
   * ✅ Kill zombie browser processes
   */
  async killZombieBrowsers() {
    try {
      Logger.info('WHATSAPP', '🔪 Killing zombie browser processes...');
      await execPromise('pkill -9 chromium 2>/dev/null || true');
      await execPromise('pkill -9 chromium-browser 2>/dev/null || true');
      await execPromise('pkill -9 chrome 2>/dev/null || true');
      await new Promise(resolve => setTimeout(resolve, 2000));
      Logger.info('WHATSAPP', '✅ Browser processes killed');
    } catch (error) {
      Logger.warn('WHATSAPP', 'Failed to kill browsers', error);
    }
  }

  /**
   * ✅ Clean session folder
   */
  async checkExistingSession(removeIfExists = false) {
    if (fs.existsSync(SESSION_PATH)) {
      Logger.warn('WHATSAPP', `Session exists: ${SESSION_PATH}`);
      if (removeIfExists) {
        try {
          fs.rmSync(SESSION_PATH, { recursive: true, force: true });
          Logger.info('WHATSAPP', '🗑️ Session removed');
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
          Logger.warn('WHATSAPP', 'Session removal failed', err);
        }
      }
    }
  }

  /**
   * ✅ Initialize WhatsApp Client with Chromium
   */
  async initialize(io) {
    if (this.isInitializing) {
      Logger.warn('WHATSAPP', 'Already initializing...');
      return;
    }
    
    this.isInitializing = true;

    try {
      // Kill zombies first
      await this.killZombieBrowsers();
      
      await this.checkExistingSession(false);

      if (this.client && this.isReady) {
        Logger.info('WHATSAPP', 'Client already ready');
        this.isInitializing = false;
        return;
      }

      // Save Socket.IO
      if (io) {
        this.io = io;
        Logger.info('WHATSAPP', '✅ Socket.IO saved');
      }

      if (!this.io) {
        throw new Error('Socket.IO instance required');
      }

      Logger.info('WHATSAPP', '📱 Creating WhatsApp client with Chromium...');

      // ✅ CHROMIUM CONFIG
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: 'gateway-solution',
          dataPath: '/var/www/solution-backend/.wwebjs_auth'
        }),
        puppeteer: {
          headless: 'new',
          executablePath: '/usr/bin/chromium', // ✅ CHROMIUM PATH
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-background-networking',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-sync',
            '--disable-breakpad',
            '--disable-client-side-phishing-detection',
            '--disable-crash-reporter',
            '--disable-oopr-debug-crash-dump',
            '--no-crash-upload',
            '--disable-low-res-tiling'
          ],
          timeout: 90000, // 90 seconds
          protocolTimeout: 90000
        }
      });

      this.setupEventHandlers();

      Logger.info('WHATSAPP', '🚀 Initializing client...');
      await this.client.initialize();

      Logger.info('WHATSAPP', '✅ Client initialized successfully');

    } catch (error) {
      Logger.error('WHATSAPP', `Init error (retry: ${this.retryCount})`, error);
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
          message: 'Scan QR code with WhatsApp mobile app' 
        });
      } catch (error) {
        Logger.error('WHATSAPP', 'QR generation error', error);
      }
    });

    this.client.on('loading_screen', (percent, message) => {
      Logger.info('WHATSAPP', `Loading: ${percent}% - ${message}`);
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
        info 
      });
      
      Logger.info('WHATSAPP', '✅ Client READY', { 
        phone: info?.wid?.user || 'unknown',
        name: info?.pushname || 'unknown'
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
      Logger.error('WHATSAPP', 'Auth failed', error);
      this.broadcastStatus({ 
        status: 'auth_failure', 
        message: 'Authentication failed. Removing session and restarting...' 
      });
      
      // Restart with session removal
      setTimeout(async () => {
        await this.restart(true);
      }, 3000);
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
      
      // Auto-restart after disconnect
      setTimeout(async () => {
        if (!this.isRestarting) {
          Logger.info('WHATSAPP', 'Auto-restarting after disconnect...');
          await this.restart();
        }
      }, 5000);
    });

    this.client.on('error', (error) => {
      Logger.error('WHATSAPP', 'Client error', error);
    });

    this.client.on('message', (msg) => {
      Logger.info('WHATSAPP', `📨 Message from: ${msg.from}`);
    });
  }

  /**
   * ✅ Broadcast status
   */
  broadcastStatus(data) {
    if (!this.io) {
      Logger.warn('WHATSAPP', `⚠️ Cannot broadcast "${data.status}" - no Socket.IO`);
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
   * ✅ Get status
   */
  getStatus() {
    return {
      status: this.currentStatus,
      isReady: this.isReady,
      qrCode: this.qrCode,
      info: this.isReady && this.client ? this.client.info : null,
      hasSocketIO: !!this.io
    };
  }

  /**
   * ✅ Get info
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
   * ✅ Handle init errors with better recovery
   */
  handleInitError(error) {
    this.retryCount++;

    const errorMsg = error.message || '';

    // Chrome/Chromium crash
    if (errorMsg.includes('Target closed') || 
        errorMsg.includes('Protocol error') ||
        errorMsg.includes('Session closed')) {
      Logger.warn('WHATSAPP', '💥 Browser crashed. Cleaning and restarting...');
      setTimeout(async () => {
        await this.restart(true); // Remove session
      }, 5000);
      return;
    }

    // Browser already running
    if (errorMsg.includes('browser is already running')) {
      Logger.warn('WHATSAPP', 'Browser still running. Killing and restarting...');
      setTimeout(async () => {
        await this.killZombieBrowsers();
        await this.restart(true);
      }, 5000);
      return;
    }

    // Retry with backoff
    if (this.retryCount < this.maxRetries) {
      const delay = Math.min(this.retryCount * 5000, 30000); // Max 30s
      Logger.warn('WHATSAPP', `Retry ${this.retryCount}/${this.maxRetries} in ${delay/1000}s`);
      
      setTimeout(async () => {
        // Remove session on 3rd retry
        if (this.retryCount === 3) {
          Logger.info('WHATSAPP', 'Removing session on retry 3...');
          await this.checkExistingSession(true);
        }
        await this.initialize();
      }, delay);
    } else {
      this.currentStatus = 'failed';
      this.broadcastStatus({ 
        status: 'failed', 
        message: 'WhatsApp initialization failed after maximum retries. Please restart manually.' 
      });
      Logger.error('WHATSAPP', 'Max retries reached', error);
    }
  }

  /**
   * ✅ Destroy client safely
   */
  async destroyClient() {
    if (this.client) {
      try {
        this.client.removeAllListeners();
        
        try {
          await this.client.destroy();
        } catch (err) {
          // Ignore destroy errors - browser may already be closed
          Logger.warn('WHATSAPP', 'Destroy error (ignored)', err.message);
        }
        
        Logger.info('WHATSAPP', '🗑️ Client destroyed');
      } catch (err) {
        Logger.warn('WHATSAPP', 'Destroy failed', err);
      } finally {
        this.client = null;
        this.isReady = false;
        this.qrCode = null;
        this.currentStatus = 'disconnected';
        // ✅ NEVER reset this.io
      }
    }
  }

  /**
   * ✅ Restart with full cleanup
   */
  async restart(removeSession = false) {
    if (this.isRestarting) {
      Logger.warn('WHATSAPP', 'Already restarting, skipping duplicate request');
      return { success: false, message: 'Already restarting' };
    }

    this.isRestarting = true;
    Logger.info('WHATSAPP', '🔄 Restarting WhatsApp client...', { 
      removeSession, 
      hasSocketIO: !!this.io 
    });

    this.retryCount = 0;

    // Kill all browsers
    await this.killZombieBrowsers();

    // Remove session if requested
    if (removeSession) {
      await this.checkExistingSession(true);
    }

    // Destroy client
    await this.destroyClient();

    this.currentStatus = 'restarting';
    this.broadcastStatus({ 
      status: 'restarting', 
      message: 'Restarting WhatsApp client...' 
    });

    // Wait before reinitializing
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      await this.initialize();
      this.isRestarting = false;
      return { 
        success: true, 
        message: 'WhatsApp restart initiated successfully' 
      };
    } catch (err) {
      Logger.error('WHATSAPP', 'Restart initialization failed', err);
      this.isRestarting = false;
      return { 
        success: false, 
        message: 'Restart failed', 
        error: err.message 
      };
    }
  }

  /**
   * ✅ Disconnect and cleanup
   */
  async disconnect() {
    Logger.info('WHATSAPP', 'Disconnecting WhatsApp...');
    
    try {
      if (this.client) {
        try {
          await this.client.logout();
        } catch (err) {
          Logger.warn('WHATSAPP', 'Logout failed (ignored)', err.message);
        }
        await this.destroyClient();
      }
      
      await this.killZombieBrowsers();
      
      if (fs.existsSync(SESSION_PATH)) {
        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        Logger.info('WHATSAPP', 'Session folder removed');
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
        message: 'Disconnect failed', 
        error: error.message 
      };
    }
  }

  /**
   * Format phone number
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
   * Send message
   */
  async sendMessage(phoneNumber, message, attempt = 0) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }
    
    const formattedNumber = this.formatPhoneNumber(phoneNumber);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const sent = await this.client.sendMessage(formattedNumber, message);
      
      Logger.info('WHATSAPP', `✅ Message sent to ${phoneNumber}`, { 
        id: sent.id._serialized 
      });
      
      return { 
        success: true, 
        messageId: sent.id._serialized, 
        timestamp: sent.timestamp, 
        to: formattedNumber 
      };
    } catch (err) {
      Logger.error('WHATSAPP', `Send failed to ${phoneNumber}`, err);
      
      // Retry on temporary errors
      if ((err.message.includes('markedUnread') || 
           err.message.includes('detached')) && 
          attempt < 2) {
        Logger.warn('WHATSAPP', 'Temporary error, retrying send...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.sendMessage(phoneNumber, message, attempt + 1);
      }
      
      throw new Error(err.message || 'Failed to send message');
    }
  }

  /**
   * Validate phone number
   */
  async isRegisteredUser(phoneNumber) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }
    
    try {
      const formatted = this.formatPhoneNumber(phoneNumber);
      const isReg = await this.client.isRegisteredUser(formatted);
      
      return { 
        isValid: isReg, 
        formattedNumber: formatted.replace('@c.us', ''), 
        message: isReg 
          ? 'Number is registered on WhatsApp' 
          : 'Number is not registered on WhatsApp' 
      };
    } catch (err) {
      Logger.error('WHATSAPP', `Validation failed for ${phoneNumber}`, err);
      throw new Error(err.message || 'Failed to validate number');
    }
  }
}

module.exports = new WhatsAppClient();