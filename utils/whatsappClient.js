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
    this.maxRetries = 5;
  }

  async checkExistingSession(removeIfExists = false) {
    if (fs.existsSync(SESSION_PATH) && removeIfExists) {
      fs.rmSync(SESSION_PATH, { recursive: true, force: true });
      Logger.info('WHATSAPP', 'Old session folder removed.');
    }
  }

  async initialize(io) {
    if (!io) throw new Error('Socket.IO instance required');
    this.io = io;

    if (this.client && this.isReady) {
      Logger.info('WHATSAPP', 'Client already initialized');
      return;
    }

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

    } catch (error) {
      Logger.error('WHATSAPP', `Initialization error (retry ${this.retryCount})`, error);
      this.handleInitError(error);
    }
  }

  setupEventHandlers() {
    if (!this.client) return;

    this.client.on('qr', async (qr) => {
      this.currentStatus = 'qr';
      this.qrCode = await qrcode.toDataURL(qr);
      this.broadcastStatus({ status: 'qr', qr: this.qrCode });
    });

    this.client.on('ready', () => {
      this.isReady = true;
      this.qrCode = null;
      this.currentStatus = 'ready';
      this.retryCount = 0;
      this.broadcastStatus({ status: 'ready', message: 'Connected successfully', info: this.getInfo() });
      Logger.info('WHATSAPP', 'Client ready');
    });

    this.client.on('authenticated', () => {
      this.currentStatus = 'authenticated';
      this.broadcastStatus({ status: 'authenticated', message: 'Authenticated' });
    });

    this.client.on('auth_failure', () => {
      this.isReady = false;
      this.currentStatus = 'auth_failure';
      this.broadcastStatus({ status: 'auth_failure', message: 'Auth failed. Rescan QR.' });
      this.restart(true); // force clear session
    });

    this.client.on('disconnected', (reason) => {
      Logger.warn('WHATSAPP', 'Client disconnected', reason);
      this.isReady = false;
      this.qrCode = null;
      this.currentStatus = 'disconnected';
      this.broadcastStatus({ status: 'disconnected', reason });
      this.restart(true);
    });

    this.client.on('error', (err) => {
      Logger.error('WHATSAPP', 'Client error', err);
      if (err.message.includes('Target closed')) {
        this.restart(true);
      }
    });
  }

  broadcastStatus(data) {
    if (!this.io) return;
    const payload = { ...data };
    if (this.qrCode) payload.qr = this.qrCode;
    this.io.emit('whatsapp-status', payload);
    Logger.info('WHATSAPP', `Status broadcast: ${data.status}`);
  }

  getStatus() {
    return {
      status: this.currentStatus,
      isReady: this.isReady,
      qrCode: this.qrCode,
      info: this.isReady && this.client ? this.client.info : null
    };
  }

  getInfo() {
    return this.client && this.isReady ? this.client.info : null;
  }

  handleInitError(error) {
    this.retryCount++;
    if (this.retryCount <= this.maxRetries) {
      Logger.warn('WHATSAPP', `Retrying init (${this.retryCount}/${this.maxRetries})...`);
      setTimeout(() => this.initialize(this.io), 5000);
    } else {
      this.currentStatus = 'failed';
      this.broadcastStatus({ status: 'failed', message: 'Max retries reached. Restart manually.' });
    }
  }

  async restart(removeSession = false) {
    Logger.info('WHATSAPP', 'Restarting client...');
    if (removeSession) await this.checkExistingSession(true);

    if (this.client) {
      this.client.removeAllListeners();
      try { await this.client.destroy(); } catch {}
      this.client = null;
    }

    this.isReady = false;
    this.qrCode = null;
    this.currentStatus = 'restarting';
    this.broadcastStatus({ status: 'restarting', message: 'Restarting WhatsApp client...' });

    setTimeout(() => this.initialize(this.io), 3000);
  }

  formatPhoneNumber(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
    else if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;
    return cleaned + '@c.us';
  }

  async sendMessage(phone, msg) {
    if (!this.isReady) throw new Error('Client not ready');
    const formatted = this.formatPhoneNumber(phone);
    return await this.client.sendMessage(formatted, msg);
  }

  async isRegisteredUser(phone) {
    if (!this.isReady) throw new Error('Client not ready');
    const formatted = this.formatPhoneNumber(phone);
    const registered = await this.client.isRegisteredUser(formatted);
    return { isValid: registered, formattedNumber: formatted.replace('@c.us','') };
  }
}

module.exports = new WhatsAppClient();
