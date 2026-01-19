// =========================================
// FILE: utils/whatsappClient.js - HARDENED PRODUCTION VERSION
// VERSION: 2.0
// FEATURES: Anti-stuck, Auto-recovery, QR watchdog, Smart session management
// =========================================

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const Logger = require('./logger');
const fs = require('fs');
const path = require('path');

// ========================================
// ABSOLUTE PATH CONFIGURATION
// ========================================
const SESSION_PATH = path.resolve(__dirname, '../whatsapp-session');

// ========================================
// STATE MACHINE CONSTANTS
// ========================================
const STATUS = {
  DISCONNECTED: 'disconnected',
  INITIALIZING: 'initializing',
  QR: 'qr',
  AUTHENTICATING: 'authenticating',
  READY: 'ready',
  RESTARTING: 'restarting',
  FATAL_ERROR: 'fatal_error'
};

// ========================================
// SINGLETON STATE
// ========================================
let client = null;
let status = STATUS.DISCONNECTED;
let qrCode = null;
let ready = false;
let io = null;
let manualDisconnect = false;

// ========================================
// WATCHDOG & RECOVERY STATE
// ========================================
let qrTimeout = null;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;
const QR_TIMEOUT_MS = 45000; // 45 detik untuk QR muncul
const RESTART_DELAY_MS = 3000;
const FATAL_RESTART_DELAY_MS = 10000;

// Prevent rapid restart spam
let lastRestartTime = 0;
const MIN_RESTART_INTERVAL_MS = 5000;

// Track session corruption
let sessionCorrupted = false;

// ========================================
// SOCKET.IO STATUS EMITTER (Throttled)
// ========================================
let lastEmit = 0;
const EMIT_THROTTLE_MS = 300;

const emitStatus = (force = false) => {
  const now = Date.now();
  if (!force && now - lastEmit < EMIT_THROTTLE_MS) return;
  lastEmit = now;

  if (io) {
    io.emit('whatsapp-status', { 
      status, 
      qrCode, 
      isReady: ready,
      attempts: initAttempts 
    });
  }
};

// ========================================
// UTILITY: FORMAT PHONE NUMBER
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
// UTILITY: CLEAR QR WATCHDOG
// ========================================
const clearQRWatchdog = () => {
  if (qrTimeout) {
    clearTimeout(qrTimeout);
    qrTimeout = null;
  }
};

// ========================================
// UTILITY: SAFE SESSION DELETE
// Hanya delete jika benar-benar corrupt/fatal
// ========================================
const deleteSession = (reason) => {
  Logger.whatsapp('SYSTEM', `🗑️ Deleting session: ${reason}`);
  
  try {
    if (fs.existsSync(SESSION_PATH)) {
      fs.rmSync(SESSION_PATH, { recursive: true, force: true });
      Logger.whatsapp('SYSTEM', '✅ Session deleted successfully');
    }
  } catch (err) {
    Logger.whatsapp('ERROR', `Failed to delete session: ${err.message}`);
  }
};

// ========================================
// UTILITY: DESTROY CLIENT SAFELY
// ========================================
const destroyClient = async () => {
  if (!client) return;
  
  Logger.whatsapp('SYSTEM', '🧹 Destroying client...');
  clearQRWatchdog();
  
  try {
    await client.destroy();
  } catch (err) {
    Logger.whatsapp('WARN', `Destroy error (ignored): ${err.message}`);
  } finally {
    client = null;
    ready = false;
  }
};

// ========================================
// CORE: INITIALIZE CLIENT (SINGLETON)
// ========================================
const initClient = async () => {
  // Prevent spam restarts
  const now = Date.now();
  if (now - lastRestartTime < MIN_RESTART_INTERVAL_MS) {
    Logger.whatsapp('WARN', '⏳ Restart too soon, skipping...');
    return;
  }
  lastRestartTime = now;

  // Check if already initializing or ready
  if (client || status === STATUS.INITIALIZING) {
    Logger.whatsapp('WARN', '⚠️ Client already exists or initializing');
    return;
  }

  // Check max attempts
  initAttempts++;
  if (initAttempts > MAX_INIT_ATTEMPTS) {
    Logger.whatsapp('ERROR', `❌ Max init attempts (${MAX_INIT_ATTEMPTS}) reached`);
    status = STATUS.FATAL_ERROR;
    emitStatus(true);
    
    // Reset after cooldown
    setTimeout(() => {
      initAttempts = 0;
      sessionCorrupted = false;
      initClient();
    }, FATAL_RESTART_DELAY_MS);
    return;
  }

  Logger.whatsapp('SYSTEM', `🚀 Initializing client (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS})...`);
  
  status = STATUS.INITIALIZING;
  ready = false;
  qrCode = null;
  emitStatus(true);

  try {
    // Create client instance
    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: SESSION_PATH // Absolute path
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
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions'
        ],
        // Timeout untuk mencegah stuck
        timeout: 60000
      },
      // Anti spam request
      qrMaxRetries: 5
    });

    // ========================================
    // EVENT: QR CODE
    // ========================================
    client.on('qr', async (qr) => {
      Logger.whatsapp('QR', '📱 QR Code generated');
      
      try {
        qrCode = await qrcode.toDataURL(qr);
        status = STATUS.QR;
        emitStatus(true);
        
        // Clear previous watchdog
        clearQRWatchdog();
        
        // Start QR watchdog - jika QR tidak di-scan dalam 45 detik, restart
        qrTimeout = setTimeout(() => {
          Logger.whatsapp('WARN', '⏰ QR timeout - not scanned in time');
          handleFailedInit('QR not scanned');
        }, QR_TIMEOUT_MS);
        
      } catch (err) {
        Logger.whatsapp('ERROR', `QR generation failed: ${err.message}`);
      }
    });

    // ========================================
    // EVENT: AUTHENTICATED
    // ========================================
    client.on('authenticated', () => {
      Logger.whatsapp('SYSTEM', '🔐 Authenticated successfully');
      clearQRWatchdog();
      status = STATUS.AUTHENTICATING;
      qrCode = null;
      sessionCorrupted = false; // Session valid
      emitStatus(true);
    });

    // ========================================
    // EVENT: READY
    // ========================================
    client.on('ready', () => {
      Logger.whatsapp('SYSTEM', '✅ Client is READY');
      clearQRWatchdog();
      
      ready = true;
      qrCode = null;
      status = STATUS.READY;
      initAttempts = 0; // Reset counter on success
      sessionCorrupted = false;
      
      emitStatus(true);
    });

    // ========================================
    // EVENT: AUTH FAILURE
    // Ini adalah FATAL ERROR - session harus dihapus
    // ========================================
    client.on('auth_failure', async (msg) => {
      Logger.whatsapp('ERROR', `❌ Auth failure: ${msg}`);
      clearQRWatchdog();
      
      manualDisconnect = true;
      sessionCorrupted = true;
      
      // Destroy client first
      await destroyClient();
      
      // Delete session karena corrupt
      deleteSession('auth_failure');
      
      status = STATUS.DISCONNECTED;
      emitStatus(true);
      
      // Restart after delay
      setTimeout(() => {
        manualDisconnect = false;
        initAttempts = 0; // Reset karena session baru
        initClient();
      }, RESTART_DELAY_MS);
    });

    // ========================================
    // EVENT: DISCONNECTED
    // Smart recovery berdasarkan reason
    // ========================================
    client.on('disconnected', async (reason) => {
      Logger.whatsapp('SYSTEM', `🔌 Disconnected: ${reason}`);
      clearQRWatchdog();
      
      ready = false;
      status = STATUS.DISCONNECTED;
      
      await destroyClient();
      emitStatus(true);
      
      // Analyze disconnect reason
      const reasonLower = String(reason).toLowerCase();
      const shouldDeleteSession = 
        reasonLower.includes('logout') ||
        reasonLower.includes('conflict') ||
        reasonLower.includes('unpaired') ||
        sessionCorrupted;
      
      if (shouldDeleteSession) {
        Logger.whatsapp('WARN', '⚠️ Session invalid, deleting...');
        deleteSession(reason);
        initAttempts = 0; // Reset karena session baru
      }
      
      // Auto restart (kecuali manual disconnect)
      if (!manualDisconnect) {
        Logger.whatsapp('SYSTEM', '♻️ Auto-restarting client...');
        setTimeout(() => {
          initClient();
        }, RESTART_DELAY_MS);
      } else {
        Logger.whatsapp('SYSTEM', '🛑 Manual disconnect - no auto restart');
        manualDisconnect = false;
      }
    });

    // ========================================
    // EVENT: LOADING SCREEN (Optional monitoring)
    // ========================================
    client.on('loading_screen', (percent, message) => {
      Logger.whatsapp('SYSTEM', `Loading: ${percent}% - ${message}`);
    });

    // ========================================
    // INITIALIZE CLIENT
    // ========================================
    await client.initialize();

  } catch (err) {
    Logger.whatsapp('ERROR', `💥 Initialization FAILED: ${err.message}`);
    console.error('INIT ERROR DETAILS:', err);
    
    clearQRWatchdog();
    await destroyClient();
    
    // Check if it's a detached frame or Chromium crash
    const errorMsg = err.message.toLowerCase();
    if (errorMsg.includes('detached') || errorMsg.includes('target closed')) {
      Logger.whatsapp('ERROR', '🔥 Detached frame / Chromium crash detected');
      sessionCorrupted = true;
    }
    
    handleFailedInit(err.message);
  }
};

// ========================================
// HANDLE FAILED INITIALIZATION
// ========================================
const handleFailedInit = (reason) => {
  status = STATUS.DISCONNECTED;
  ready = false;
  qrCode = null;
  emitStatus(true);
  
  // Jika sudah terlalu banyak attempt, tandai session corrupt
  if (initAttempts >= MAX_INIT_ATTEMPTS - 1) {
    sessionCorrupted = true;
  }
  
  // Restart dengan delay
  setTimeout(() => {
    if (!manualDisconnect) {
      initClient();
    }
  }, RESTART_DELAY_MS);
};

// ========================================
// ENSURE CLIENT READY (dengan validasi extra)
// ========================================
const ensureReady = () => {
  if (!client) {
    throw new Error('WhatsApp client not initialized');
  }
  
  if (!ready) {
    throw new Error('WhatsApp client not ready yet');
  }
  
  if (!client.info) {
    throw new Error('WhatsApp client info not available');
  }
  
  // Extra check: pastikan pupPage masih alive
  if (client.pupPage && client.pupPage.isClosed()) {
    throw new Error('WhatsApp browser page closed unexpectedly');
  }
};

// ========================================
// API: SEND MESSAGE (dengan detached frame recovery)
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
    Logger.whatsapp('SYSTEM', `✉️ Message sent to ${formatted}`);
    
    return { success: true, formattedNumber: formatted };

  } catch (err) {
    Logger.whatsapp('ERROR', `Send message failed: ${err.message}`);
    
    // Detached frame recovery
    const errorMsg = err.message.toLowerCase();
    if (errorMsg.includes('detached') || 
        errorMsg.includes('target closed') || 
        errorMsg.includes('session closed')) {
      
      Logger.whatsapp('ERROR', '🔥 Detached frame during send, triggering recovery...');
      sessionCorrupted = true;
      
      // Destroy dan restart
      await destroyClient();
      status = STATUS.DISCONNECTED;
      emitStatus(true);
      
      setTimeout(() => {
        initClient();
      }, RESTART_DELAY_MS);
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
  
  try {
    return await client.isRegisteredUser(chatId);
  } catch (err) {
    Logger.whatsapp('ERROR', `Validate number failed: ${err.message}`);
    throw err;
  }
};

// ========================================
// NOTIFICATION FUNCTIONS (ABSTRACTION LAYER)
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
// GET STATUS (Public API)
// ========================================
const getStatus = () => ({
  status,
  qrCode,
  isReady: ready,
  attempts: initAttempts,
  sessionPath: SESSION_PATH
});

// ========================================
// DISCONNECT (Manual)
// ========================================
const disconnect = async () => {
  if (!client) {
    Logger.whatsapp('WARN', 'No client to disconnect');
    return;
  }
  
  Logger.whatsapp('SYSTEM', '🛑 Manual disconnect requested');
  manualDisconnect = true;
  clearQRWatchdog();
  
  await destroyClient();
  
  status = STATUS.DISCONNECTED;
  qrCode = null;
  initAttempts = 0;
  emitStatus(true);
  
  Logger.whatsapp('SYSTEM', '✅ Client disconnected');
};

// ========================================
// RESTART (Manual)
// ========================================
const restart = async (socketIo) => {
  Logger.whatsapp('SYSTEM', '♻️ Manual restart requested');
  
  if (socketIo) io = socketIo;
  
  await disconnect();
  
  // Reset counters
  initAttempts = 0;
  sessionCorrupted = false;
  manualDisconnect = false;
  
  setTimeout(() => {
    initClient();
  }, RESTART_DELAY_MS);
};

// ========================================
// INITIALIZE (External Entry Point)
// ========================================
let initializedOnce = false;

const initialize = (socketIo) => {
  if (initializedOnce) {
    Logger.whatsapp('WARN', '⚠️ Already initialized, skipping');
    return;
  }
  
  initializedOnce = true;
  io = socketIo;
  
  Logger.whatsapp('SYSTEM', '🎯 Starting WhatsApp Gateway...');
  Logger.whatsapp('SYSTEM', `📁 Session path: ${SESSION_PATH}`);
  
  initClient();
};

// ========================================
// GRACEFUL SHUTDOWN (untuk PM2)
// ========================================
const shutdown = async () => {
  Logger.whatsapp('SYSTEM', '🛑 Graceful shutdown initiated...');
  manualDisconnect = true;
  clearQRWatchdog();
  await destroyClient();
  Logger.whatsapp('SYSTEM', '✅ Shutdown complete');
};

// PM2 graceful shutdown
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ========================================
// EXPORTS (Public API)
// ========================================
module.exports = {
  // Core
  initialize,
  restart,
  disconnect,
  shutdown,
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
  
  // Status getters
  get isReady() { return ready; },
  get currentStatus() { return status; }
};