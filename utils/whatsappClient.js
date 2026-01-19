// =========================================
// FILE: utils/whatsappTemplates.js
// WhatsApp Message Templates - Enhanced
// =========================================

// ========== CONFIGURATION ==========
const CONFIG = {
  support: {
    email: 'support@nuansasolution.id',
    whatsapp: '0896-4444-8721',
    teamName: 'Gateway SOLUTION Team'
  },
  security: {
    otpValidityMinutes: 5
  },
  locale: 'id-ID',
  currency: 'IDR',
  timezone: 'Asia/Jakarta'
};

// ========== UTILITY FUNCTIONS ==========

/**
 * Format amount to Indonesian Rupiah
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
const formatCurrency = (amount) => {
  if (typeof amount !== 'number' || isNaN(amount)) {
    console.warn('Invalid amount provided to formatCurrency:', amount);
    return 'Rp 0';
  }
  
  return new Intl.NumberFormat(CONFIG.locale, {
    style: 'currency',
    currency: CONFIG.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

/**
 * Format date to Indonesian format with timezone
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date string
 */
const formatDate = (date) => {
  try {
    const dateObj = new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      console.warn('Invalid date provided to formatDate:', date);
      return 'Tanggal tidak valid';
    }
    
    return new Intl.DateTimeFormat(CONFIG.locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: CONFIG.timezone
    }).format(dateObj);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Tanggal tidak valid';
  }
};

/**
 * Format date without time
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date string (date only)
 */
const formatDateOnly = (date) => {
  try {
    const dateObj = new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      console.warn('Invalid date provided to formatDateOnly:', date);
      return 'Tanggal tidak valid';
    }
    
    return new Intl.DateTimeFormat(CONFIG.locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: CONFIG.timezone
    }).format(dateObj);
  } catch (error) {
    console.error('Error formatting date only:', error);
    return 'Tanggal tidak valid';
  }
};

/**
 * Sanitize user input to prevent template injection
 * @param {string} input - User input to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') {
    return String(input || '');
  }
  // Remove potential formatting characters that could break WhatsApp formatting
  return input.replace(/[*_~`]/g, '');
};

/**
 * Build footer section for messages
 * @returns {string} Standard footer
 */
const buildFooter = () => {
  return `_${CONFIG.support.teamName}_
📧 ${CONFIG.support.email}`;
};

/**
 * Build support contact section
 * @returns {string} Support contact info
 */
const buildSupportContact = () => {
  return `📧 ${CONFIG.support.email}
📱 WA: ${CONFIG.support.whatsapp}`;
};

// ========== MESSAGE TEMPLATES ==========

const WhatsAppTemplates = {
  /**
   * 📱 REGISTRATION OTP
   * @param {string} name - User's name
   * @param {string} otp - OTP code
   * @returns {string} Formatted message
   */
  registrationOTP: (name, otp) => {
    const safeName = sanitizeInput(name);
    const safeOTP = String(otp);
    
    return `🎉 *Selamat Datang di Gateway SOLUTION!*

Halo *${safeName}*! 👋

Terima kasih telah mendaftar. Berikut adalah kode OTP Anda:

🔐 *${safeOTP}*

⏰ Kode ini berlaku selama *${CONFIG.security.otpValidityMinutes} menit*.
🔒 Jangan bagikan kode ini kepada siapapun.

Jika Anda tidak melakukan registrasi ini, abaikan pesan ini.

${buildFooter()}`;
  },

  /**
   * 👋 WELCOME MESSAGE
   * @param {string} name - User's name
   * @param {string} packageName - Package name
   * @returns {string} Formatted message
   */
  welcome: (name, packageName) => {
    const safeName = sanitizeInput(name);
    const safePackageName = sanitizeInput(packageName);
    
    return `🎊 *Selamat! Akun Anda Berhasil Diverifikasi*

Halo *${safeName}*! 🙌

Akun Anda telah berhasil diverifikasi dan siap digunakan!

📦 *Paket Trial Anda:* ${safePackageName}
⏰ *Durasi:* 3 Hari
✨ *Status:* Aktif

Anda sekarang dapat mengakses semua fitur premium kami selama masa trial.

🚀 *Mulai Sekarang:*
Login ke dashboard Anda dan jelajahi semua fitur yang tersedia!

Butuh bantuan? Hubungi kami kapan saja.

${buildFooter()}
${buildSupportContact()}`;
  },

  /**
   * 🔐 LOGIN ALERT
   * @param {string} name - User's name
   * @param {Date|string} time - Login time
   * @param {string} device - Device info (optional)
   * @returns {string} Formatted message
   */
  loginAlert: (name, time, device = 'Unknown') => {
    const safeName = sanitizeInput(name);
    const safeDevice = sanitizeInput(device);
    const formattedTime = formatDate(time);
    
    return `🔐 *Notifikasi Login*

Halo *${safeName}*,

Kami mendeteksi login baru ke akun Anda:

⏰ *Waktu:* ${formattedTime}
📱 *Device:* ${safeDevice}

Jika ini bukan Anda, segera hubungi kami dan ubah password Anda.

${buildFooter()}`;
  },

  /**
   * 💳 PAYMENT RECEIVED
   * @param {string} name - User's name
   * @param {string} packageName - Package name
   * @param {number} amount - Payment amount
   * @param {string} paymentId - Payment ID
   * @returns {string} Formatted message
   */
  paymentReceived: (name, packageName, amount, paymentId) => {
    const safeName = sanitizeInput(name);
    const safePackageName = sanitizeInput(packageName);
    const safePaymentId = sanitizeInput(paymentId);
    const formattedAmount = formatCurrency(amount);
    
    return `💳 *Pembayaran Diterima*

Halo *${safeName}*,

Pembayaran Anda telah kami terima dan sedang dalam proses verifikasi.

📦 *Paket:* ${safePackageName}
💰 *Jumlah:* ${formattedAmount}
🆔 *ID Payment:* ${safePaymentId}

⏱️ *Proses verifikasi biasanya memakan waktu 1-5 menit.*

Anda akan mendapat notifikasi segera setelah paket Anda diaktifkan.

Terima kasih atas kepercayaan Anda!

${buildFooter()}`;
  },

  /**
   * ✅ PAYMENT APPROVED
   * @param {string} name - User's name
   * @param {string} packageName - Package name
   * @param {number} duration - Duration in days
   * @param {Date|string} expiryDate - Expiry date
   * @returns {string} Formatted message
   */
  paymentApproved: (name, packageName, duration, expiryDate) => {
    const safeName = sanitizeInput(name);
    const safePackageName = sanitizeInput(packageName);
    const formattedExpiry = formatDateOnly(expiryDate);
    
    return `✅ *Paket Berhasil Diaktifkan!*

Halo *${safeName}*! 🎉

Pembayaran Anda telah diverifikasi dan paket berhasil diaktifkan!

📦 *Paket:* ${safePackageName}
⏰ *Durasi:* ${duration} hari
📅 *Berlaku hingga:* ${formattedExpiry}

🚀 Anda sekarang dapat menikmati semua fitur premium!

Login ke dashboard untuk mulai menggunakan layanan kami.

Terima kasih!

${buildFooter()}`;
  },

  /**
   * ⏰ PACKAGE EXPIRING SOON
   * @param {string} name - User's name
   * @param {string} packageName - Package name
   * @param {number} daysLeft - Days remaining
   * @param {Date|string} expiryDate - Expiry date
   * @returns {string} Formatted message
   */
  packageExpiring: (name, packageName, daysLeft, expiryDate) => {
    const safeName = sanitizeInput(name);
    const safePackageName = sanitizeInput(packageName);
    const formattedExpiry = formatDateOnly(expiryDate);
    
    return `⏰ *Pengingat: Paket Akan Segera Berakhir*

Halo *${safeName}*,

Paket Anda akan segera berakhir:

📦 *Paket:* ${safePackageName}
⏳ *Sisa Waktu:* ${daysLeft} hari lagi
📅 *Berakhir pada:* ${formattedExpiry}

🔄 *Jangan sampai terputus!*
Perpanjang sekarang untuk tetap menikmati akses penuh.

💡 _Tips: Perpanjang lebih awal dan nikmati benefit tanpa jeda!_

${buildFooter()}`;
  },

  /**
   * 🔴 PACKAGE EXPIRED
   * @param {string} name - User's name
   * @param {string} packageName - Package name
   * @returns {string} Formatted message
   */
  packageExpired: (name, packageName) => {
    const safeName = sanitizeInput(name);
    const safePackageName = sanitizeInput(packageName);
    
    return `🔴 *Paket Telah Berakhir*

Halo *${safeName}*,

Paket *${safePackageName}* Anda telah berakhir.

Akses premium Anda kini tidak aktif. Untuk melanjutkan:

🔄 *Perpanjang Paket*
Pilih paket yang sama atau upgrade ke paket yang lebih tinggi.

💬 *Butuh Bantuan?*
Tim kami siap membantu Anda memilih paket terbaik!

${buildFooter()}
${buildSupportContact()}`;
  },

  /**
   * 🔒 FORGOT PASSWORD OTP
   * @param {string} name - User's name
   * @param {string} otp - OTP code
   * @returns {string} Formatted message
   */
  forgotPasswordOTP: (name, otp) => {
    const safeName = sanitizeInput(name);
    const safeOTP = String(otp);
    
    return `🔒 *Reset Password - Kode Verifikasi*

Halo *${safeName}*,

Anda meminta untuk mereset password. Berikut kode OTP Anda:

🔐 *${safeOTP}*

⏰ Kode ini berlaku selama *${CONFIG.security.otpValidityMinutes} menit*.
🔒 Jangan bagikan kode ini kepada siapapun.

Jika Anda tidak meminta reset password, abaikan pesan ini dan password Anda tetap aman.

${buildFooter()}`;
  },

  /**
   * ✔️ PASSWORD CHANGED
   * @param {string} name - User's name
   * @param {Date|string} time - Change time
   * @returns {string} Formatted message
   */
  passwordChanged: (name, time) => {
    const safeName = sanitizeInput(name);
    const formattedTime = formatDate(time);
    
    return `✔️ *Password Berhasil Diubah*

Halo *${safeName}*,

Password Anda telah berhasil diubah pada:
⏰ ${formattedTime}

Jika ini bukan Anda, segera hubungi kami:
${buildSupportContact()}

${buildFooter()}`;
  },

  /**
   * 🆙 PACKAGE UPGRADED
   * @param {string} name - User's name
   * @param {string} oldPackage - Old package name
   * @param {string} newPackage - New package name
   * @param {Date|string} expiryDate - New expiry date
   * @returns {string} Formatted message
   */
  packageUpgraded: (name, oldPackage, newPackage, expiryDate) => {
    const safeName = sanitizeInput(name);
    const safeOldPackage = sanitizeInput(oldPackage);
    const safeNewPackage = sanitizeInput(newPackage);
    const formattedExpiry = formatDateOnly(expiryDate);
    
    return `🆙 *Paket Berhasil Diupgrade!*

Halo *${safeName}*! 🎉

Paket Anda telah berhasil diupgrade!

📦 *Paket Lama:* ${safeOldPackage}
🚀 *Paket Baru:* ${safeNewPackage}
📅 *Berlaku hingga:* ${formattedExpiry}

Selamat menikmati fitur-fitur baru!

${buildFooter()}`;
  }
};

// ========== EXPORTS ==========

module.exports = { 
  WhatsAppTemplates, 
  formatCurrency, 
  formatDate,
  formatDateOnly,
  CONFIG 
};