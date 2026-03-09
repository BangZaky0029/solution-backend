/**
 * ============================================
 * WhatsApp Gateway HTTP Client
 * ============================================
 * 
 * HTTP client for communicating with WhatsApp Gateway (Baileys)
 * at solution-whatsApp service on port 3001
 * 
 * Usage:
 *   const waGateway = require('./utils/whatsappGateway');
 *   await waGateway.sendOTP('628xxx', 'John', '123456');
 */

const Logger = require('./logger');
const PhoneValidator = require('./phoneValidator');

// Gateway configuration - use getters for lazy evaluation
const GATEWAY_TIMEOUT = 10000; // 10 seconds

/**
 * WhatsApp Gateway Client Class
 */
class WhatsAppGateway {
    // Use getters for lazy env var evaluation (after dotenv loads)
    get baseUrl() {
        return process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001';
    }

    get enabled() {
        return process.env.WHATSAPP_ENABLED === 'true';
    }

    /**
     * Check if gateway is enabled and connected
     */
    async isConnected() {
        if (!this.enabled) {
            Logger.warn('WHATSAPP_GATEWAY', 'Gateway disabled (WHATSAPP_ENABLED !== true)');
            return false;
        }

        try {
            Logger.info('WHATSAPP_GATEWAY', `Checking connection to ${this.baseUrl}`);
            const response = await this._fetch('/api/whatsapp/main-session/status', 'GET');

            // Check isConnected or status === 'open'
            const isConnected = response.isConnected === true || response.status === 'open';
            Logger.info('WHATSAPP_GATEWAY', `Connection status: ${response.status}, isConnected: ${isConnected}`);
            return isConnected;
        } catch (error) {
            Logger.error('WHATSAPP_GATEWAY', `Connection check failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Get gateway status
     */
    async getStatus() {
        try {
            return await this._fetch('/api/whatsapp/main-session/status', 'GET');
        } catch (error) {
            return { connection: 'disconnected', error: error.message };
        }
    }

    /**
     * Send a raw text message
     * @param {string} phone - Phone number
     * @param {string} message - Message text
     */
    async sendMessage(phone, message) {
        if (!this.enabled) {
            Logger.warn('WHATSAPP_GATEWAY', 'Gateway disabled, skipping message');
            return { success: false, reason: 'disabled' };
        }

        const phoneValidation = PhoneValidator.validate(phone);
        if (!phoneValidation.valid) {
            throw new Error(phoneValidation.message);
        }

        try {
            const result = await this._fetch('/api/whatsapp/main-session/send', 'POST', {
                number: phoneValidation.normalized,
                message: message
            });

            Logger.whatsapp('MESSAGE_SENT', `To: ${phoneValidation.normalized}`, { messageLength: message.length });
            return result;
        } catch (error) {
            Logger.error('WHATSAPP_GATEWAY', 'Send message failed', error);
            throw error;
        }
    }

    /**
     * Send OTP verification message
     * @param {string} phone - Phone number
     * @param {string} userName - User's name
     * @param {string} otp - OTP code
     * @param {string} type - Type of OTP: 'register' | 'reset_password'
     */
    async sendOTP(phone, userName, otp, type = 'register') {
        let message;

        if (type === 'register') {
            message = this._formatOTPRegister(userName, otp);
        } else if (type === 'reset_password') {
            message = this._formatOTPResetPassword(userName, otp);
        } else if (type === 'resend_reset_password') {
            message = this._formatOTPResend(userName, otp);
        } else if (type === 'delete_account') {
            message = this._formatOTPDeleteAccount(userName, otp);
        } else {
            message = this._formatOTPGeneric(userName, otp);
        }

        return await this.sendMessage(phone, message);
    }

    /**
     * Send payment received confirmation
     * @param {string} phone - Phone number
     * @param {object} data - Payment data
     */
    async sendPaymentReceived(phone, data) {
        const message = this._formatPaymentReceived(data);
        return await this.sendMessage(phone, message);
    }

    /**
     * Send payment approved notification
     * @param {string} phone - Phone number
     * @param {object} data - Payment data
     */
    async sendPaymentApproved(phone, data) {
        const message = this._formatPaymentApproved(data);
        return await this.sendMessage(phone, message);
    }

    /**
     * Send subscription reminder
     * @param {string} phone - Phone number
     * @param {object} data - Subscription data
     */
    async sendSubscriptionReminder(phone, data) {
        const message = this._formatSubscriptionReminder(data);
        return await this.sendMessage(phone, message);
    }

    /**
     * Send payment confirmation notification to Admin
     * @param {object} data - { user_name, package_name, amount, invoice_id }
     */
    async sendAdminPaymentConfirmation(data) {
        if (!this.enabled) return { success: false, reason: 'disabled' };

        try {
            Logger.info('WHATSAPP_GATEWAY', `Sending admin payment notification for user: ${data.user_name}`);
            return await this._fetch('/api/whatsapp/main-session/notify/payment-confirmation', 'POST', data);
        } catch (error) {
            Logger.error('WHATSAPP_GATEWAY', 'Failed to send admin payment notification', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send Developer Notification (081995770190)
     * @param {string} event_type - Type of event
     * @param {object} data - Data to format into the message
     */
    async sendDeveloperNotification(event_type, data) {
        if (!this.enabled) return { success: false, reason: 'disabled' };

        const DEV_NUMBER = process.env.DEVELOPER_WA_NUMBER || '6281995770190';
        let message = '';

        try {
            const logsLink = "\n\n📊 *Full Logs:* https://docs.google.com/spreadsheets/d/1RmkiCW4zRe7DrBSHfCyKZBM1TChHyYYZDBR-p2AB5nY/edit?gid=0#gid=0";

            switch (event_type) {
                case 'REGISTER':
                    message = `🚀 *[DEV ALERT] - NEW USER REGISTERED*\n\n👤 *Nama:* ${data.name || '-'}\n📧 *Email:* ${data.email || '-'}\n📱 *Phone:* ${data.phone || '-'}\n\n🎁 *Status Trial:* ${data.trialStatus || 'Tidak Diberikan'}\n🕒 *Timestamp:* ${new Date().toLocaleString('id-ID')}\n\n_Sistem memantau pendaftaran user baru_` + logsLink;
                    break;
                case 'LOGIN':
                    message = `🔑 *[DEV ALERT] - USER LOGIN*\n\n👤 *User:* ${data.name || '-'} (${data.email || '-'})\n🕒 *Timestamp:* ${new Date().toLocaleString('id-ID')}\n\n_Aktivitas masuk dashboard terpantau_` + logsLink;
                    break;
                case 'PAYMENT_PENDING':
                    message = `💳 *[DEV ALERT] - NEW PAYMENT PENDING*\n\n👤 *User:* ${data.userName || '-'}\n📦 *Paket:* ${data.packageName || '-'}\n💰 *Nominal:* Rp ${this._formatCurrency(data.amount || 0)}\n🧾 *Invoice ID:* #${data.paymentId || '-'}\n\n⚠️ Memerlukan approval Admin di Dashboard!` + logsLink;
                    break;
                case 'PAYMENT_APPROVED':
                    message = `✅ *[DEV ALERT] - PAYMENT APPROVED*\n\n👤 *User:* ${data.userName || '-'}\n📦 *Paket Diaktifkan:* ${data.packageName || '-'}\n⌛ *Durasi:* ${data.durationDays || '-'} Hari\n\n_Paket berhasil diaktivasi secara sistem._` + logsLink;
                    break;
                case 'PACKAGE_EXPIRED':
                    message = `⚠️ *[DEV ALERT] - PACKAGE EXPIRED*\n\n👤 *User:* ${data.userName || '-'}\n📱 *Phone:* ${data.phone || '-'}\n📦 *Paket Hangus:* ${data.packageName || '-'}\n\n_Sistem cron job telah menonaktifkan token / langganan user ini._` + logsLink;
                    break;
                case 'PACKAGE_EXPIRING_SOON':
                    message = `🕒 *[DEV ALERT] - PACKAGE EXPIRING SOON*\n\n👤 *User:* ${data.userName || '-'}\n📦 *Paket:* ${data.packageName || '-'}\n⏳ *Sisa Hari:* ${data.daysLeft || '-'} Hari\n\n_User telah dikirimi peringatan otomatis._` + logsLink;
                    break;
                case 'EXPIRY_REMINDER_SENT':
                    message = `📢 *[DEV ALERT] - EXPIRY REMINDER SENT*\n\n👤 *User:* ${data.userName || '-'}\n📦 *Paket:* ${data.packageName || '-'}\n⏳ *H- ${data.daysLeft || '-'}* \n\n_Notifikasi pengingat pembayaran dikirim._` + logsLink;
                    break;
                default:
                    message = `🔧 *[DEV ALERT] - SYSTEM EVENT*\n\n*Event:* ${event_type}\n*Data:* ${JSON.stringify(data)}` + logsLink;
            }

            Logger.info('WHATSAPP_GATEWAY', `Sending DEV notification for event: ${event_type}`);
            return await this._fetch('/api/whatsapp/main-session/send', 'POST', {
                number: DEV_NUMBER,
                message: message
            });
        } catch (error) {
            Logger.error('WHATSAPP_GATEWAY', 'Failed to send DEV notification', error);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // Message Templates
    // ============================================

    // ============================================
    // Templates (Disesuaikan dengan Request User)
    // ============================================

    _formatOTPRegister(userName, otp) {
        return `🔐 *Verifikasi Akun Nuansa Solution*

Halo ${userName}! 👋

Kode OTP Anda: *${otp}*

⏱️ Berlaku 5 menit
⚠️ Jangan bagikan kode ini ke siapapun

_Nuansa Solution - Your Digital Partner_`;
    }

    _formatOTPResetPassword(userName, otp) {
        // Format: OTP Reset Password anda (723643)
        return `OTP Reset Password anda (${otp})

_Nuansa Solution_`;
    }

    _formatOTPResend(userName, otp) {
        // Format: Resend OTP (723643)
        return `Resend OTP (${otp})

_Nuansa Solution_`;
    }

    _formatOTPDeleteAccount(userName, otp) {
        return `🚨 *PERINGATAN: PENGHAPUSAN AKUN*

Halo ${userName},

Anda meminta untuk menghapus akun Anda secara permanen.
Kode Konfirmasi: *${otp}*

⚠️ *Tindakan ini tidak dapat dibatalkan.*
Semua data (profil, riwayat transaksi, paket aktif) akan dihapus selamanya.

Jika ini bukan Anda, segera hubungi admin.
⏱️ Berlaku 5 menit`;
    }

    _formatOTPGeneric(userName, otp) {
        return `🔐 *Kode Verifikasi*

Halo ${userName}!
Kode OTP Anda: *${otp}*

⏱️ Berlaku 5 menit`;
    }

    _formatPaymentReceived(data) {
        return `📬 *Bukti Pembayaran Diterima*

Halo ${data.userName}! 👋

Terima kasih atas pembayaran Anda.
📦 Paket: ${data.packageName}
💰 Jumlah: Rp ${this._formatCurrency(data.amount)}
📝 ID Pembayaran: #${data.paymentId}

⏳ Menunggu verifikasi admin (maks. 1x24 jam)

_Nuansa Solution - Your Digital Partner_`;
    }

    _formatPaymentApproved(data) {
        return `✅ *Pembayaran Berhasil!*

Halo ${data.userName}! 🎉

Pembayaran Anda telah dikonfirmasi!
📦 Paket: ${data.packageName}
⏱️ Durasi: ${data.durationDays} hari
📅 Berlaku hingga: ${data.expiryDate}

Silakan login dan nikmati fitur premium Anda!

🔗 https://nuansasolution.id

_Nuansa Solution - Your Digital Partner_`;
    }

    _formatSubscriptionReminder(data) {
        let urgency = '';
        if (data.daysLeft <= 1) {
            urgency = '🚨 *URGENT!*';
        } else if (data.daysLeft <= 3) {
            urgency = '⚠️ *Perhatian!*';
        } else {
            urgency = '📢 *Reminder*';
        }

        return `${urgency}

Halo ${data.userName}! 👋

Langganan Anda akan berakhir dalam *${data.daysLeft} hari* lagi.

📦 Paket: ${data.packageName}
📅 Berakhir: ${data.expiryDate}

Perpanjang sekarang untuk tetap menikmati fitur premium!

🔗 https://nuansasolution.id/dashboard

_Nuansa Solution - Your Digital Partner_`;
    }

    // ============================================
    // Helper Methods
    // ============================================

    _formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID').format(amount);
    }

    /**
     * HTTP fetch wrapper with timeout
     */
    async _fetch(endpoint, method, body = null) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT);

        try {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'x-session-id': 'main-session'
                },
                signal: controller.signal
            };

            if (body) {
                options.body = JSON.stringify(body);
            }

            const response = await fetch(`${this.baseUrl}${endpoint}`, options);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            return data;
        } finally {
            clearTimeout(timeout);
        }
    }
}

// Export singleton instance
module.exports = new WhatsAppGateway();
