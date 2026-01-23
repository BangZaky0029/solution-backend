// utils/whatsappClient.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const Logger = require('./logger');
const PhoneValidator = require('./phoneValidator');

class WhatsAppClient {
  constructor() {
    this.client = null;
    this.io = null;
    this.status = 'idle'; // idle | qr | ready | disconnected | error
    this.qr = null;
    this.initializing = false;
  }

  // =========================
  // STATUS READ
  // =========================
  get isReady() {
    return this.status === 'ready';
  }

  getStatus() {
    return {
      status: this.status,
      qr: this.qr,
    };
  }

  // =========================
  // HEALTH CHECK (FE FRIENDLY)
  // =========================
  async healthCheck() {
    if (!this.client) {
      return { status: 'idle', qr: null };
    }
    return this.getStatus();
  }

  // =========================
  // CHECK IF NUMBER IS REGISTERED ON WHATSAPP
  // =========================
  async checkNumberRegistered(phone) {
    if (!this.client) throw new Error('WhatsApp client not initialized');
    if (this.status !== 'ready') throw new Error('WhatsApp not ready');

    try {
      const normalized = PhoneValidator.normalize(phone);
      const numberId = await this.client.getNumberId(normalized);
      
      Logger.info('WHATSAPP', `Check number ${normalized}: ${numberId ? 'registered' : 'not registered'}`);
      
      return numberId !== null;
    } catch (error) {
      Logger.error('WHATSAPP', 'Error checking number registration', error);
      throw error;
    }
  }

  // =========================
  // SEND MESSAGE
  // =========================
  async sendMessage(phone, message) {
    if (!this.client) throw new Error('WhatsApp client not initialized');
    if (this.status !== 'ready') throw new Error('WhatsApp not ready');

    const phoneValidation = PhoneValidator.validate(phone);
    if (!phoneValidation.valid) {
      throw new Error(phoneValidation.message);
    }

    const normalizedPhone = phoneValidation.normalized;
    const chatId = PhoneValidator.toChatId(normalizedPhone);

    const numberId = await this.client.getNumberId(normalizedPhone);
    if (!numberId) {
      throw new Error('Nomor WhatsApp tidak terdaftar di WhatsApp');
    }

    Logger.info('WHATSAPP', `Sending message to ${chatId}`);

    // 🔥 FIX: disable sendSeen crash
    await this.client.pupPage.evaluate(() => {
      if (window.WWebJS?.sendSeen) {
        window.WWebJS.sendSeen = async () => {};
      }
    });

    return await this.client.sendMessage(chatId, message);
  }


  // =========================
  // INIT CLIENT
  // =========================
  async initialize(io) {
    if (this.initializing) return Logger.warn('WHATSAPP', 'Initialize skipped (initializing)');
    if (this.client) return Logger.warn('WHATSAPP', 'Initialize skipped (already running)');
    if (!io) throw new Error('Socket.IO instance not provided');

    this.initializing = true;
    this.io = io;
    Logger.info('WHATSAPP', 'Initializing WhatsApp client...');

    this.client = new Client({
      authStrategy: new LocalAuth({ clientId: 'main-session' }),
      puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    });

    // ===== QR =====
    this.client.on('qr', async (qr) => {
      this.status = 'qr';
      this.qr = await qrcode.toDataURL(qr);
      this.io.emit('whatsapp-status', this.getStatus());
      Logger.info('WHATSAPP', 'QR generated');
    });

    // ===== READY =====
    this.client.on('ready', async () => {
      this.status = 'ready';
      this.qr = null;
      Logger.info('WHATSAPP', 'WhatsApp READY, stabilizing...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      this.io.emit('whatsapp-status', this.getStatus());
    });

    // ===== DISCONNECTED =====
    this.client.on('disconnected', (reason) => {
      this.status = 'disconnected';
      this.qr = null;
      this.io.emit('whatsapp-status', this.getStatus());
      Logger.warn('WHATSAPP', 'WhatsApp disconnected', reason);
    });

    // ===== AUTH FAILURE =====
    this.client.on('auth_failure', (msg) => {
      this.status = 'error';
      this.qr = null;
      this.io.emit('whatsapp-status', { status: 'error', message: 'Auth failure' });
      Logger.error('WHATSAPP', 'Auth failure', msg);
    });

    try {
      await this.client.initialize();
    } catch (err) {
      this.status = 'error';
      Logger.error('WHATSAPP', err.message);
    } finally {
      this.initializing = false;
    }
  }

  // =========================
  // RESTART CLIENT
  // =========================
  async restart(io) {
    Logger.warn('WHATSAPP', 'Restarting WhatsApp client...');
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (err) {
        Logger.error('WHATSAPP', 'Destroy failed', err.message);
      }
    }
    this.client = null;
    this.status = 'idle';
    this.qr = null;
    await this.initialize(io);
  }
}

module.exports = new WhatsAppClient();