// =========================================
// FILE: utils/whatsappClient.js - FIXED SINGLETON
// SOLUSI: Anti detached frame + auto-recovery
// =========================================

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const Logger = require('./logger');
const fs = require('fs');
const path = require('path');


// ========================================
// SINGLETON STATE
// ========================================
let client = null;
let status = 'disconnected';
let qrCode = null;
let ready = false;
let initializing = false;
let io = null;
let manualDisconnect = false;


// ========================================
// EMIT STATUS KE SOCKET.IO
// ========================================
let lastEmit = 0;

const emitStatus = (force = false) => {
  const now = Date.now();
  if (!force && now - lastEmit < 300) return;
  lastEmit = now;

  if (io) {
    io.emit('whatsapp-status', { status, qrCode, isReady: ready });
  }
};


// ========================================
// FORMAT PHONE NUMBER
// ========================================
const formatPhoneNumber = (phoneNumber) => {
  let formatted = phoneNumber.replace(/[^0-9]/g, '');
  
  if (!formatted.startsWith('62')) {
    if (formatted.startsWith('0')) {
      formatted = '62' + formatted.substring(1);
    } else {
      formatted = '62' + formatted;
    }
  }
  
  return formatted;
};

// ========================================
// INIT CLIENT (SINGLETON)
// ========================================
const initClient = async () => {
  if (client || initializing) {
    Logger.whatsapp('SYSTEM', 'WhatsApp client already exists or initializing');
    return;
  }

  initializing = true;
  status = 'connecting';
  emitStatus();

  try {
    client = new Client({
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

    // ========================================
    // EVENT: QR CODE
    // ========================================
    client.on('qr', async (qr) => {
        Logger.whatsapp('QR', 'QR Code generated');
        qrCode = await qrcode.toDataURL(qr);
        status = 'qr'; // ✅ INI PENTING
        emitStatus(true);
      });



    // ========================================
    // EVENT: READY
    // ========================================
    client.on('ready', () => {
      Logger.whatsapp('SYSTEM', 'Client is READY');
      ready = true;
      qrCode = null;
      status = 'ready';
      initializing = false;
      emitStatus(true);
    });

    // ========================================
    // EVENT: AUTHENTICATED
    // ========================================
    client.on('authenticated', () => {
      Logger.whatsapp('SYSTEM', 'Authenticated successfully');
      status = 'connecting';
      emitStatus();
    });

    // ========================================
    // EVENT: AUTH FAILURE
    // ========================================
    client.on('auth_failure', async (msg) => {
      Logger.whatsapp('ERROR', `Auth failure: ${msg}`);

      manualDisconnect = true; // ⬅️ TAMBAHKAN INI

      const sessionPath = path.join(__dirname, '../whatsapp-session');
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      } catch (e) {
        Logger.whatsapp('ERROR', 'Failed to remove session folder');
      }


      status = 'disconnected';
      ready = false;
      client = null;
      initializing = false;
      emitStatus();

      setTimeout(() => {
        manualDisconnect = false;
        initClient();
      }, 2000);
    });



    // ========================================
    // EVENT: DISCONNECTED (AUTO RECOVERY)
    // ========================================
    client.on('disconnected', async (reason) => {
      Logger.whatsapp('SYSTEM', `Disconnected: ${reason}`);

      ready = false;
      status = 'disconnected';
      client = null;
      initializing = false;
      emitStatus();

      if (!manualDisconnect) {
        setTimeout(() => {
          Logger.whatsapp('SYSTEM', 'Auto-restarting WhatsApp client...');
          initClient();
        }, 3000);
      }

      manualDisconnect = false;
    });


    await client.initialize();

  } catch (err) {
    Logger.whatsapp('ERROR', 'WhatsApp initialization FAILED');
    console.error('❌ INIT ERROR:', err);
    
    status = 'disconnected';
    client = null;
    initializing = false;
    ready = false;
    emitStatus();
  }

};

// ========================================
// ENSURE CLIENT READY
// ========================================
const ensureReady = () => {
  if (!client || !ready) {
    throw new Error('WhatsApp client not ready');
  }
  if (!client.info) {
    throw new Error('WhatsApp client info not ready');
  }
};

// ========================================
// API: SEND MESSAGE (ABSTRACTION)
// ========================================
const sendMessage = async (phoneNumber, message) => {
  ensureReady();

  const formatted = formatPhoneNumber(phoneNumber);
  const chatId = formatted + '@c.us';

  try {
    const isRegistered = await client.isRegisteredUser(chatId);
    
    if (!isRegistered) {
      throw new Error('Number is not registered on WhatsApp');
    }

    await client.sendMessage(chatId, message);
    Logger.whatsapp('SYSTEM', `Message sent to ${formatted}`);
    
    return { success: true, formattedNumber: formatted };

  } catch (err) {
    // ========================================
    // DETACHED FRAME RECOVERY
    // ========================================
    if (err.message && err.message.includes('detached')) {
      if (!initializing) {
        Logger.whatsapp('ERROR', '♻️ Detached frame detected, restarting...');
        ready = false;
        client = null;
        initializing = false;
        setTimeout(initClient, 1000);
      }
    }

    
    throw err;
  }
};

// ========================================
// API: VALIDATE NUMBER
// ========================================
const validateNumber = async (phoneNumber) => {
  ensureReady();
  
  const formatted = formatPhoneNumber(phoneNumber);
  const chatId = formatted + '@c.us';
  
  return await client.isRegisteredUser(chatId);
};

// ========================================
// NOTIFICATION FUNCTIONS (ABSTRACTION)
// ========================================

const sendOTP = async (phoneNumber, otpCode, userName = 'User') => {
  const message = `🔐 *Gateway SOLUTION - Verification Code*\n\n` +
                 `Hello ${userName}! 👋\n\n` +
                 `Your OTP verification code is:\n\n` +
                 `*${otpCode}*\n\n` +
                 `⏰ This code is valid for 5 minutes.\n` +
                 `🔒 Please do not share this code with anyone.\n\n` +
                 `If you didn't request this code, please ignore this message.\n\n` +
                 `_Gateway SOLUTION Team_`;

  return await sendMessage(phoneNumber, message);
};

const sendWelcomeMessage = async (phoneNumber, userName) => {
  const message = `🎉 *Welcome to Gateway SOLUTION!*\n\n` +
                 `Hi ${userName}! 👋\n\n` +
                 `Thank you for registering with us!\n\n` +
                 `✅ Your account has been verified successfully.\n` +
                 `🎁 You now have access to our 3-day trial package!\n\n` +
                 `_Gateway SOLUTION Team_`;

  return await sendMessage(phoneNumber, message);
};

const sendLoginNotification = async (phoneNumber, userName, ipAddress) => {
  const timestamp = new Date().toLocaleString('id-ID');
  const message = `🔔 *Login Notification*\n\n` +
                 `Hi ${userName}!\n\n` +
                 `New login detected:\n` +
                 `⏰ ${timestamp}\n` +
                 `📍 IP: ${ipAddress}\n\n` +
                 `_Gateway SOLUTION Security Team_`;

  return await sendMessage(phoneNumber, message);
};

const sendPaymentReceived = async (phoneNumber, userName, packageName, amount) => {
  const message = `💳 *Payment Received*\n\n` +
                 `Hi ${userName}!\n\n` +
                 `We've received your payment for:\n` +
                 `📦 ${packageName}\n` +
                 `💰 Rp ${amount.toLocaleString('id-ID')}\n\n` +
                 `⏳ Pending verification...\n\n` +
                 `_Gateway SOLUTION Team_`;

  return await sendMessage(phoneNumber, message);
};

const sendPaymentApproved = async (phoneNumber, userName, packageName, expiryDate) => {
  const message = `✅ *Payment Approved!*\n\n` +
                 `Great news, ${userName}!\n\n` +
                 `📦 ${packageName}\n` +
                 `📅 Valid Until: ${expiryDate}\n\n` +
                 `Visit: https://nuansasolution.id/profile\n\n` +
                 `_Gateway SOLUTION Team_`;

  return await sendMessage(phoneNumber, message);
};

const sendExpiryWarning = async (phoneNumber, userName, packageName, daysLeft) => {
  const message = `⚠️ *Package Expiring Soon*\n\n` +
                 `Hi ${userName},\n\n` +
                 `Your ${packageName} expires in ${daysLeft} days.\n\n` +
                 `Renew: https://nuansasolution.id/payment\n\n` +
                 `_Gateway SOLUTION Team_`;

  return await sendMessage(phoneNumber, message);
};

const sendPackageExpired = async (phoneNumber, userName, packageName) => {
  const message = `⏰ *Package Expired*\n\n` +
                 `Hi ${userName},\n\n` +
                 `Your ${packageName} has expired.\n\n` +
                 `Renew: https://nuansasolution.id/payment\n\n` +
                 `_Gateway SOLUTION Team_`;

  return await sendMessage(phoneNumber, message);
};

const sendPasswordResetOTP = async (phoneNumber, userName, otpCode) => {
  const message = `🔒 *Password Reset Request*\n\n` +
                 `Hi ${userName},\n\n` +
                 `Your reset code:\n\n` +
                 `*${otpCode}*\n\n` +
                 `⏰ Expires in 5 minutes.\n\n` +
                 `_Gateway SOLUTION Security Team_`;

  return await sendMessage(phoneNumber, message);
};

const sendPasswordChanged = async (phoneNumber, userName) => {
  const timestamp = new Date().toLocaleString('id-ID');
  const message = `✅ *Password Changed*\n\n` +
                 `Hi ${userName},\n\n` +
                 `Your password was changed at ${timestamp}.\n\n` +
                 `_Gateway SOLUTION Security Team_`;

  return await sendMessage(phoneNumber, message);
};

// ========================================
// GET STATUS
// ========================================
const getStatus = () => ({
  status,
  qrCode,
  isReady: ready
});

// ========================================
// DISCONNECT
// ========================================
const disconnect = async () => {
  if (client) {
    manualDisconnect = true;
    await client.destroy().catch(() => {});
    client = null;
    ready = false;
    status = 'disconnected';
    qrCode = null;
    initializing = false;
    emitStatus();
    Logger.whatsapp('SYSTEM', 'Client disconnected');
  }
};



// ========================================
// RESTART
// ========================================
const restart = async (socketIo) => {
  io = socketIo;
  await disconnect();
  setTimeout(() => {
    initClient();
  }, 2000);
};

// ========================================
// INITIALIZE (EXTERNAL)
// ========================================
let initializedOnce = false;

const initialize = (socketIo) => {
  if (initializedOnce) return;
  initializedOnce = true;

  io = socketIo;
  initClient();
};


// ========================================
// EXPORTS
// ========================================
module.exports = {
  // Core
  initialize,
  restart,
  disconnect,
  getStatus,
  
  // Abstraction API
  sendMessage,
  validateNumber,
  
  // Notifications
  sendOTP,
  sendWelcomeMessage,
  sendLoginNotification,
  sendPaymentReceived,
  sendPaymentApproved,
  sendExpiryWarning,
  sendPackageExpired,
  sendPasswordResetOTP,
  sendPasswordChanged,
  
  // Status
  get isReady() { return ready; }
};