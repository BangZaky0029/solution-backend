// utils/whatsappTemplates.js
class WhatsAppTemplates {
  static registrationOTP(name, otp) {
    return `🔐 *Kode Verifikasi Gateway NUANSA*

Halo *${name}*! 👋

Kode OTP Anda adalah:
*${otp}*

Kode ini berlaku selama 10 menit.
Jangan bagikan kode ini kepada siapapun!

Terima kasih telah mendaftar di Gateway NUANSA.
🚀 _All systems operational_`;
  }

  static welcome(name, packageName) {
    return `🎉 *Selamat Datang di Gateway NUANSA!*

Halo *${name}*! 👋

Akun Anda telah berhasil diverifikasi! ✅

📦 *Paket Anda:* ${packageName}
🚀 Status: Aktif

Anda sekarang dapat menggunakan semua fitur Gateway NUANSA.

Terima kasih telah bergabung bersama kami!

_© 2026 Gateway NUANSA - All systems operational_`;
  }

  static loginAlert(name, time) {
    return `🔔 *Notifikasi Login*

Halo *${name}*,

Kami mendeteksi login baru ke akun Anda:
⏰ Waktu: ${time}

Jika ini bukan Anda, segera hubungi support kami.

_© 2026 Gateway NUANSA - Security Alert_`;
  }

  static paymentSuccess(name, packageName, amount, expiredAt) {
    return `💳 *Pembayaran Berhasil!*

Halo *${name}*! 🎉

Pembayaran Anda telah berhasil diproses.

📦 *Paket:* ${packageName}
💰 *Total:* Rp ${amount.toLocaleString('id-ID')}
📅 *Berlaku hingga:* ${expiredAt}

Paket Anda sekarang aktif! ✅

Terima kasih telah mempercayai Gateway NUANSA.

_© 2026 Gateway Apto_`;
  }

  static customMessage(message) {
    return `${message}

_Sent via Gateway NUANSA WhatsApp Bot_`;
  }
}

module.exports = { WhatsAppTemplates };