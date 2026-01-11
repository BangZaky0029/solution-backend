// =========================================
// FILE: utils/whatsappTemplates.js - NEW
// WhatsApp Message Templates
// =========================================

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
};

const formatDate = (date) => {
  return new Intl.DateTimeFormat('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
};

const WhatsAppTemplates = {
  /**
   * 📱 REGISTRATION OTP
   */
  registrationOTP: (name, otp) => {
    return `🎉 *Selamat Datang di Gateway SOLUTION!*

Halo *${name}*! 👋

Terima kasih telah mendaftar. Berikut adalah kode OTP Anda:

🔐 *${otp}*

⏰ Kode ini berlaku selama *5 menit*.
🔒 Jangan bagikan kode ini kepada siapapun.

Jika Anda tidak melakukan registrasi ini, abaikan pesan ini.

_Gateway SOLUTION Team_
📧 support@nuansasolution.id`;
  },

  /**
   * 👋 WELCOME MESSAGE
   */
  welcome: (name, packageName) => {
    return `🎊 *Selamat! Akun Anda Berhasil Diverifikasi*

Halo *${name}*! 🙌

Akun Anda telah berhasil diverifikasi dan siap digunakan!

📦 *Paket Trial Anda:* ${packageName}
⏰ *Durasi:* 3 Hari
✨ *Status:* Aktif

Anda sekarang dapat mengakses semua fitur premium kami selama masa trial.

🚀 *Mulai Sekarang:*
Login ke dashboard Anda dan jelajahi semua fitur yang tersedia!

Butuh bantuan? Hubungi kami kapan saja.

_Gateway SOLUTION Team_
📧 support@nuansasolution.id
📱 WA: 0896-4444-8721`;
  },

  /**
   * 🔐 LOGIN ALERT
   */
  loginAlert: (name, time, device = 'Unknown') => {
    return `🔐 *Notifikasi Login*

Halo *${name}*,

Kami mendeteksi login baru ke akun Anda:

⏰ *Waktu:* ${time}
📱 *Device:* ${device}

Jika ini bukan Anda, segera hubungi kami dan ubah password Anda.

_Gateway SOLUTION Team_`;
  },

  /**
   * 💳 PAYMENT RECEIVED
   */
  paymentReceived: (name, packageName, amount, paymentId) => {
    return `💳 *Pembayaran Diterima*

Halo *${name}*,

Pembayaran Anda telah kami terima dan sedang dalam proses verifikasi.

📦 *Paket:* ${packageName}
💰 *Jumlah:* ${formatCurrency(amount)}
🆔 *ID Payment:* ${paymentId}

⏱️ *Proses verifikasi biasanya memakan waktu 1-5 menit.*

Anda akan mendapat notifikasi segera setelah paket Anda diaktifkan.

Terima kasih atas kepercayaan Anda!

_Gateway SOLUTION Team_`;
  },

  /**
   * ✅ PAYMENT APPROVED
   */
  paymentApproved: (name, packageName, duration, expiryDate) => {
    return `✅ *Paket Berhasil Diaktifkan!*

Halo *${name}*! 🎉

Pembayaran Anda telah diverifikasi dan paket berhasil diaktifkan!

📦 *Paket:* ${packageName}
⏰ *Durasi:* ${duration} hari
📅 *Berlaku hingga:* ${expiryDate}

🚀 Anda sekarang dapat menikmati semua fitur premium!

Login ke dashboard untuk mulai menggunakan layanan kami.

Terima kasih!

_Gateway SOLUTION Team_
📧 support@nuansasolution.id`;
  },

  /**
   * ⏰ PACKAGE EXPIRING SOON
   */
  packageExpiring: (name, packageName, daysLeft, expiryDate) => {
    return `⏰ *Pengingat: Paket Akan Segera Berakhir*

Halo *${name}*,

Paket Anda akan segera berakhir:

📦 *Paket:* ${packageName}
⏳ *Sisa Waktu:* ${daysLeft} hari lagi
📅 *Berakhir pada:* ${expiryDate}

🔄 *Jangan sampai terputus!*
Perpanjang sekarang untuk tetap menikmati akses penuh.

💡 _Tips: Perpanjang lebih awal dan nikmati benefit tanpa jeda!_

_Gateway SOLUTION Team_`;
  },

  /**
   * 🔴 PACKAGE EXPIRED
   */
  packageExpired: (name, packageName) => {
    return `🔴 *Paket Telah Berakhir*

Halo *${name}*,

Paket *${packageName}* Anda telah berakhir.

Akses premium Anda kini tidak aktif. Untuk melanjutkan:

🔄 *Perpanjang Paket*
Pilih paket yang sama atau upgrade ke paket yang lebih tinggi.

💬 *Butuh Bantuan?*
Tim kami siap membantu Anda memilih paket terbaik!

_Gateway SOLUTION Team_
📧 support@nuansasolution.id
📱 WA: 0896-4444-8721`;
  },

  /**
   * 🔒 FORGOT PASSWORD OTP
   */
  forgotPasswordOTP: (name, otp) => {
    return `🔒 *Reset Password - Kode Verifikasi*

Halo *${name}*,

Anda meminta untuk mereset password. Berikut kode OTP Anda:

🔐 *${otp}*

⏰ Kode ini berlaku selama *5 menit*.
🔒 Jangan bagikan kode ini kepada siapapun.

Jika Anda tidak meminta reset password, abaikan pesan ini dan password Anda tetap aman.

_Gateway SOLUTION Team_`;
  },

  /**
   * ✔️ PASSWORD CHANGED
   */
  passwordChanged: (name, time) => {
    return `✔️ *Password Berhasil Diubah*

Halo *${name}*,

Password Anda telah berhasil diubah pada:
⏰ ${time}

Jika ini bukan Anda, segera hubungi kami:
📧 support@nuansasolution.id
📱 WA: 0896-4444-8721

_Gateway SOLUTION Team_`;
  },

  /**
   * 🆙 PACKAGE UPGRADED
   */
  packageUpgraded: (name, oldPackage, newPackage, expiryDate) => {
    return `🆙 *Paket Berhasil Diupgrade!*

Halo *${name}*! 🎉

Paket Anda telah berhasil diupgrade!

📦 *Paket Lama:* ${oldPackage}
🚀 *Paket Baru:* ${newPackage}
📅 *Berlaku hingga:* ${expiryDate}

Selamat menikmati fitur-fitur baru!

_Gateway SOLUTION Team_`;
  }
};

module.exports = { WhatsAppTemplates, formatCurrency, formatDate };