// whatsappClient.js (FINAL STABIL)
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
    this.isRestarting = false;
  }

  // ✅ Check session folder, bisa hapus jika removeIfExists = true
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

  // Initialize WhatsApp client
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
          executablePath: '/usr/bin/chromium-browser', // 🔥 WAJIB
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

    this.client.on('auth_failure', async () => {
      this.isReady = false;
      this.currentStatus = 'auth_failure';
      this.broadcastStatus({ status: 'auth_failure', message: 'Authentication failed. Please rescan QR.' });
      // Optional: restart dengan hapus session otomatis
      await this.restart(true);
    });

    this.client.on('disconnected', async (reason) => {
      this.isReady = false;
      this.qrCode = null;
      this.currentStatus = 'disconnected';
      this.broadcastStatus({ status: 'disconnected', message: 'WhatsApp disconnected', reason });
      // Async restart
      setTimeout(async () => await this.restart(), 5000);
    });

    this.client.on('error', (error) => {
      Logger.error('WHATSAPP', 'Client error', error);
    });

    this.client.on('message', (msg) => {
      Logger.info('WHATSAPP', `Message from ${msg.from}: ${msg.body.substring(0, 50)}`);
    });
  }

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

  getStatus() {
    return {
      status: this.currentStatus,
      isReady: this.isReady,
      qrCode: this.qrCode,
      info: this.isReady && this.client ? this.client.info : null
    };
  }

  getInfo() {
    if (!this.client || !this.isReady) return null;
    return this.client.info;
  }

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
      Logger.warn('WHATSAPP', `Retry ${this.retryCount}/${this.maxRetries} in 3 seconds...`);
      setTimeout(() => this.initialize(this.io), 3000);
    } else {
      this.currentStatus = 'failed';
      this.broadcastStatus({ status: 'failed', message: 'WhatsApp client disabled, manual restart required.' });
      Logger.error('WHATSAPP', 'Max retries reached. WhatsApp disabled.', error);
    }
  }

  async destroyClient() {
    if (this.client) {
      try {
        this.client.removeAllListeners();
        await this.client.destroy();
        Logger.info('WHATSAPP', 'Client destroyed successfully');
      } catch (err) {
        Logger.warn('WHATSAPP', 'Failed to destroy client, ignoring...', err);
      } finally {
        this.client = null;
        this.isReady = false;
        this.qrCode = null;
        this.currentStatus = 'disconnected';
      }
    }
  }

  async restart(removeSession = false) {
    if (this.isRestarting) return;
    this.isRestarting = true;

    Logger.info('WHATSAPP', 'Restarting client...');
    this.retryCount = 0;

    if (removeSession && fs.existsSync(SESSION_PATH)) {
      try {
        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        Logger.info('WHATSAPP', 'Session folder removed successfully');
      } catch (err) {
        Logger.warn('WHATSAPP', 'Failed to remove session folder', err);
      }
    }

    await this.destroyClient();

    this.currentStatus = 'restarting';
    this.broadcastStatus({ status: 'restarting', message: 'Restarting WhatsApp client...' });

    setTimeout(async () => {
      try {
        await this.initialize(this.io);
      } catch (err) {
        Logger.error('WHATSAPP', 'Failed to initialize after restart', err);
      } finally {
        this.isRestarting = false;
      }
    }, 3000);
  }


  formatPhoneNumber(phoneNumber) {
    let cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
    else if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;
    return cleaned + '@c.us';
  }

  async sendMessage(phoneNumber, message, attempt = 0) {
    if (!this.isReady) {
      Logger.error('WHATSAPP', `Cannot send message, client not ready`);
      return { success: false, error: 'Client not ready' };
    }

    const formattedNumber = this.formatPhoneNumber(phoneNumber);

    try {
      // Pastikan chat ready
      let chat;
      try {
        chat = await this.client.getChatById(formattedNumber);
        if (!chat) {
          Logger.info('WHATSAPP', `Creating new chat with ${formattedNumber}`);
          chat = await this.client.sendMessage(formattedNumber, ''); // dummy msg to init chat
          await chat.delete(true); // hapus dummy
        }
      } catch (err) {
        Logger.warn('WHATSAPP', `Chat not found, will send anyway`, err);
      }

      // Delay kecil untuk stabilisasi internal
      await new Promise(r => setTimeout(r, 1000));

      const sentMessage = await this.client.sendMessage(formattedNumber, message);
      Logger.info('WHATSAPP', `✅ Message sent successfully to ${phoneNumber}`);
      return {
        success: true,
        messageId: sentMessage.id._serialized,
        timestamp: sentMessage.timestamp,
        to: formattedNumber
      };

    } catch (err) {
      Logger.error('WHATSAPP', `Send message failed to ${phoneNumber}`, err);

      // retry for temporary internal error
      if ((err.message.includes('markedUnread') || err.message.includes('detached Frame')) && attempt < 2) {
        Logger.warn('WHATSAPP', 'Detected temporary internal error, retrying message...');
        await new Promise(r => setTimeout(r, 2000));
        return this.sendMessage(phoneNumber, message, attempt + 1);
      }

      return { success: false, error: err.message };
    }
  }



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
