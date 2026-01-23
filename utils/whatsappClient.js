// =========================================
// FILE: utils/whatsappClient.js - COMPLETE FIX
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
    this.io = null; // ✅ NEVER reset this to null
    this.isReady = false;
    this.qrCode = null;
    this.currentStatus = 'disconnected';
    this.retryCount = 0;
    this.maxRetries = 3;
    this.isRestarting = false;
    this.isInitializing = false;
  }

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

      // ✅ Save Socket.IO instance (CRITICAL!)
      if (io) {
        this.io = io;
        Logger.info('WHATSAPP', '✅ Socket.IO instance SAVED');
      }

      // ✅ Validate Socket.IO
      if (!this.io) {
        Logger.error('WHATSAPP', '❌ Socket.IO instance is NULL!');
        throw new Error('Socket.IO instance required for initialization');
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
            '--single-process'
          ]
        }
      });

      this.setupEventHandlers();

      Logger.info('WHATSAPP', '🚀 Initializing WhatsApp client...');
      await this.client.initialize();

      Logger.info('WHATSAPP', '✅ Client initialized successfully');

    } catch (error) {
      Logger.error('WHATSAPP', `Initialization error (retry: ${this.retryCount})`, error);
      this.handleInitError(error);
    } finally {
      this.isInitializing = false;
    }
  }

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
      Logger.info('WHATSAPP', '✅ Client is ready', { phone: info?.wid?.user || 'unknown' });
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
        if (!this.isRestarting) await this.restart();
      }, 5000);
    });

    this.client.on('error', (error) => {
      Logger.error('WHATSAPP', 'Client error', error);
    });

    this.client.on('message', (msg) => {
      Logger.info('WHATSAPP', `📨 Message: ${msg.from} - ${msg.body.substring(0, 50)}`);
    });
  }

  broadcastStatus(data) {
    if (!this.io) {
      Logger.warn('WHATSAPP', `⚠️ Cannot broadcast "${data.status}" - Socket.IO NULL`);
      return;
    }

    const payload = { ...data, timestamp: new Date().toISOString() };
    if (this.qrCode) payload.qr = this.qrCode;

    this.io.emit('whatsapp-status', payload);
    Logger.info('WHATSAPP', `📡 Broadcast: ${data.status}`);
  }

  getStatus() {
    return {
      status: this.currentStatus,
      isReady: this.isReady,
      qrCode: this.qrCode,
      info: this.isReady && this.client ? this.client.info : null,
      hasSocketIO: !!this.io // ✅ Debug info
    };
  }

  getInfo() {
    if (!this.client || !this.isReady) return null;
    try {
      return this.client.info;
    } catch (error) {
      Logger.error('WHATSAPP', 'Failed to get info', error);
      return null;
    }
  }

  handleInitError(error) {
    this.retryCount++;

    if (error.message.includes('browser is already running')) {
      Logger.warn('WHATSAPP', 'Browser running. Waiting 10s...');
      setTimeout(() => this.restart(), 10000);
      return;
    }

    if (error.message.includes('Target closed')) {
      Logger.warn('WHATSAPP', 'Browser closed. Restarting...');
      this.restart();
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

  async destroyClient() {
    if (this.client) {
      try {
        this.client.removeAllListeners();
        await this.client.destroy();
        Logger.info('WHATSAPP', '🗑️ Client destroyed');
      } catch (err) {
        Logger.warn('WHATSAPP', 'Destroy failed gracefully', err);
      } finally {
        this.client = null;
        this.isReady = false;
        this.qrCode = null;
        this.currentStatus = 'disconnected';
        // ✅✅✅ CRITICAL: DO NOT RESET this.io HERE!
        // this.io MUST BE PRESERVED
      }
    }
  }

  async restart(removeSession = false) {
    if (this.isRestarting) {
      Logger.warn('WHATSAPP', 'Already restarting, skipping');
      return { success: false, message: 'Already restarting' };
    }

    this.isRestarting = true;
    Logger.info('WHATSAPP', '🔄 Restarting...', { 
      removeSession, 
      hasSocketIO: !!this.io // ✅ Debug
    });

    this.retryCount = 0;

    if (removeSession && fs.existsSync(SESSION_PATH)) {
      try {
        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        Logger.info('WHATSAPP', '🗑️ Session removed');
      } catch (err) {
        Logger.warn('WHATSAPP', 'Session removal failed', err);
      }
    }

    await this.destroyClient();

    this.currentStatus = 'restarting';
    this.broadcastStatus({ status: 'restarting', message: 'Restarting...' });

    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      // ✅ Don't pass io - use preserved this.io
      await this.initialize();
      this.isRestarting = false;
      return { success: true, message: 'Restart initiated' };
    } catch (err) {
      Logger.error('WHATSAPP', 'Restart failed', err);
      this.isRestarting = false;
      return { success: false, message: 'Restart failed', error: err.message };
    }
  }

  async disconnect() {
    Logger.info('WHATSAPP', 'Disconnecting...');
    try {
      if (this.client) {
        await this.client.logout();
        await this.destroyClient();
      }
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

  formatPhoneNumber(phoneNumber) {
    let cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
    else if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;
    return cleaned + '@c.us';
  }

  async sendMessage(phoneNumber, message, attempt = 0) {
    if (!this.isReady) throw new Error('WhatsApp not ready');
    const formattedNumber = this.formatPhoneNumber(phoneNumber);
    try {
      await new Promise(r => setTimeout(r, 1000));
      const sent = await this.client.sendMessage(formattedNumber, message);
      Logger.info('WHATSAPP', `✅ Sent to ${phoneNumber}`, { id: sent.id._serialized });
      return { success: true, messageId: sent.id._serialized, timestamp: sent.timestamp, to: formattedNumber };
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

  async isRegisteredUser(phoneNumber) {
    if (!this.isReady) throw new Error('WhatsApp not ready');
    try {
      const formatted = this.formatPhoneNumber(phoneNumber);
      const isReg = await this.client.isRegisteredUser(formatted);
      return { isValid: isReg, formattedNumber: formatted.replace('@c.us', ''), message: isReg ? 'Registered' : 'Not registered' };
    } catch (err) {
      Logger.error('WHATSAPP', `Validation failed: ${phoneNumber}`, err);
      throw new Error(err.message || 'Validation failed');
    }
  }
}

module.exports = new WhatsAppClient();