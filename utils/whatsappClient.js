// =========================================
// FILE: utils/whatsappClient.js - CHROME CRASH FIX
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
    this.maxRetries = 3;
    this.isRestarting = false;
    this.isInitializing = false;
  }

  /**
   * ✅ Kill zombie Chrome processes
   */
  async killZombieChrome() {
    try {
      Logger.info('WHATSAPP', '🔪 Killing zombie Chrome processes...');
      await execPromise('pkill -9 chrome 2>/dev/null || true');
      await execPromise('pkill -9 chromium 2>/dev/null || true');
      await new Promise(resolve => setTimeout(resolve, 2000));
      Logger.info('WHATSAPP', '✅ Chrome processes killed');
    } catch (error) {
      Logger.warn('WHATSAPP', 'Failed to kill Chrome processes', error);
    }
  }

  /**
   * ✅ Clean session folder
   */
  async checkExistingSession(removeIfExists = false) {
    if (fs.existsSync(SESSION_PATH)) {
      Logger.warn('WHATSAPP', `Session folder exists: ${SESSION_PATH}`);
      if (removeIfExists) {
        try {
          fs.rmSync(SESSION_PATH, { recursive: true, force: true });
          Logger.info('WHATSAPP', '🗑️ Session folder removed');
          // Wait for filesystem
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
          Logger.warn('WHATSAPP', 'Failed to remove session', err);
        }
      }
    }
  }

  /**
   * ✅ Initialize WhatsApp Client
   */
  async initialize(io) {
    if (this.isInitializing) {
      Logger.warn('WHATSAPP', 'Already initializing, skipping...');
      return;
    }
    
    this.isInitializing = true;

    try {
      // ✅ Kill zombie Chrome first
      await this.killZombieChrome();
      
      await this.checkExistingSession(false);

      if (this.client && this.isReady) {
        Logger.info('WHATSAPP', 'Client already ready');
        this.isInitializing = false;
        return;
      }

      // ✅ Save Socket.IO
      if (io) {
        this.io = io;
        Logger.info('WHATSAPP', '✅ Socket.IO saved');
      }

      if (!this.io) {
        throw new Error('Socket.IO instance required');
      }

      Logger.info('WHATSAPP', '📱 Creating WhatsApp client...');

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
            '--single-process',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-background-networking'
          ],
          timeout: 60000, // ✅ Increase timeout
          protocolTimeout: 60000
        }
      });

      this.setupEventHandlers();

      Logger.info('WHATSAPP', '🚀 Initializing client...');
      await this.client.initialize();

      Logger.info('WHATSAPP', '✅ Client initialized');

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
        this.broadcastStatus({ status: 'qr', qr: this.qrCode, message: 'Scan QR code' });
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
      this.broadcastStatus({ status: 'ready', message: 'Connected', info });
      Logger.info('WHATSAPP', '✅ Client ready', { phone: info?.wid?.user || 'unknown' });
    });

    this.client.on('authenticated', () => {
      this.currentStatus = 'authenticated';
      this.broadcastStatus({ status: 'authenticated', message: 'Authenticated' });
      Logger.info('WHATSAPP', '🔐 Authenticated');
    });

    this.client.on('auth_failure', async (error) => {
      this.isReady = false;
      this.currentStatus = 'auth_failure';
      Logger.error('WHATSAPP', 'Auth failed', error);
      this.broadcastStatus({ status: 'auth_failure', message: 'Auth failed' });
      await this.restart(true);
    });

    this.client.on('disconnected', async (reason) => {
      this.isReady = false;
      this.qrCode = null;
      this.currentStatus = 'disconnected';
      Logger.warn('WHATSAPP', `Disconnected: ${reason}`);
      this.broadcastStatus({ status: 'disconnected', message: 'Disconnected', reason });
      
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
      Logger.info('WHATSAPP', `📨 Message: ${msg.from}`);
    });
  }

  /**
   * ✅ Broadcast status
   */
  broadcastStatus(data) {
    if (!this.io) {
      Logger.warn('WHATSAPP', `⚠️ Cannot broadcast "${data.status}"`);
      return;
    }

    const payload = { ...data, timestamp: new Date().toISOString() };
    if (this.qrCode) payload.qr = this.qrCode;

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
   * ✅ Handle init errors
   */
  handleInitError(error) {
    this.retryCount++;

    // ✅ Check for Chrome crash
    if (error.message.includes('Target closed') || 
        error.message.includes('Protocol error')) {
      Logger.warn('WHATSAPP', '💥 Chrome crashed. Cleaning up and restarting...');
      setTimeout(async () => {
        await this.restart(true); // Remove session
      }, 3000);
      return;
    }

    if (error.message.includes('browser is already running')) {
      Logger.warn('WHATSAPP', 'Browser running. Waiting 10s...');
      setTimeout(() => this.restart(true), 10000);
      return;
    }

    if (this.retryCount < this.maxRetries) {
      const delay = this.retryCount * 3000;
      Logger.warn('WHATSAPP', `Retry ${this.retryCount}/${this.maxRetries} in ${delay/1000}s`);
      setTimeout(() => this.initialize(), delay);
    } else {
      this.currentStatus = 'failed';
      this.broadcastStatus({ status: 'failed', message: 'Max retries reached' });
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
        
        // ✅ Try to destroy gracefully
        try {
          await this.client.destroy();
        } catch (err) {
          Logger.warn('WHATSAPP', 'Graceful destroy failed, forcing...', err);
        }
        
        Logger.info('WHATSAPP', '🗑️ Client destroyed');
      } catch (err) {
        Logger.warn('WHATSAPP', 'Destroy error', err);
      } finally {
        this.client = null;
        this.isReady = false;
        this.qrCode = null;
        this.currentStatus = 'disconnected';
        // ✅ DO NOT reset this.io
      }
    }
  }

  /**
   * ✅ Restart with cleanup
   */
  async restart(removeSession = false) {
    if (this.isRestarting) {
      Logger.warn('WHATSAPP', 'Already restarting');
      return { success: false, message: 'Already restarting' };
    }

    this.isRestarting = true;
    Logger.info('WHATSAPP', '🔄 Restarting...', { 
      removeSession, 
      hasSocketIO: !!this.io 
    });

    this.retryCount = 0;

    // ✅ Kill zombie Chrome
    await this.killZombieChrome();

    // ✅ Remove session if requested
    if (removeSession) {
      await this.checkExistingSession(true);
    }

    // ✅ Destroy client
    await this.destroyClient();

    this.currentStatus = 'restarting';
    this.broadcastStatus({ status: 'restarting', message: 'Restarting...' });

    // ✅ Wait before reinitializing
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      await this.initialize();
      this.isRestarting = false;
      return { success: true, message: 'Restart initiated' };
    } catch (err) {
      Logger.error('WHATSAPP', 'Restart failed', err);
      this.isRestarting = false;
      return { success: false, message: 'Restart failed', error: err.message };
    }
  }

  /**
   * ✅ Disconnect
   */
  async disconnect() {
    Logger.info('WHATSAPP', 'Disconnecting...');
    try {
      if (this.client) {
        await this.client.logout();
        await this.destroyClient();
      }
      
      await this.killZombieChrome();
      
      if (fs.existsSync(SESSION_PATH)) {
        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        Logger.info('WHATSAPP', 'Session removed');
      }
      
      this.currentStatus = 'disconnected';
      this.broadcastStatus({ status: 'disconnected', message: 'Disconnected' });
      return { success: true, message: 'Disconnected' };
    } catch (error) {
      Logger.error('WHATSAPP', 'Disconnect error', error);
      return { success: false, message: 'Disconnect failed', error: error.message };
    }
  }

  /**
   * Format phone number
   */
  formatPhoneNumber(phoneNumber) {
    let cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
    else if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;
    return cleaned + '@c.us';
  }

  /**
   * Send message
   */
  async sendMessage(phoneNumber, message, attempt = 0) {
    if (!this.isReady) throw new Error('WhatsApp not ready');
    const formattedNumber = this.formatPhoneNumber(phoneNumber);
    try {
      await new Promise(r => setTimeout(r, 1000));
      const sent = await this.client.sendMessage(formattedNumber, message);
      Logger.info('WHATSAPP', `✅ Sent to ${phoneNumber}`, { id: sent.id._serialized });
      return { 
        success: true, 
        messageId: sent.id._serialized, 
        timestamp: sent.timestamp, 
        to: formattedNumber 
      };
    } catch (err) {
      Logger.error('WHATSAPP', `Send failed: ${phoneNumber}`, err);
      if ((err.message.includes('markedUnread') || err.message.includes('detached')) && attempt < 2) {
        Logger.warn('WHATSAPP', 'Retrying send...');
        await new Promise(r => setTimeout(r, 2000));
        return this.sendMessage(phoneNumber, message, attempt + 1);
      }
      throw new Error(err.message || 'Send failed');
    }
  }

  /**
   * Validate phone number
   */
  async isRegisteredUser(phoneNumber) {
    if (!this.isReady) throw new Error('WhatsApp not ready');
    try {
      const formatted = this.formatPhoneNumber(phoneNumber);
      const isReg = await this.client.isRegisteredUser(formatted);
      return { 
        isValid: isReg, 
        formattedNumber: formatted.replace('@c.us', ''), 
        message: isReg ? 'Registered' : 'Not registered' 
      };
    } catch (err) {
      Logger.error('WHATSAPP', `Validation failed: ${phoneNumber}`, err);
      throw new Error(err.message || 'Validation failed');
    }
  }
}

module.exports = new WhatsAppClient();