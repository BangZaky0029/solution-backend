const { logToFirestore } = require('./firebaseAdmin');
const { appendRow } = require('./googleSheetsService');
const Logger = require('./logger');
const waGateway = require('./whatsappGateway');

/**
 * Activity Logger Service
 * Centralizes all logging activity to external services (Firebase, Google Sheets, WhatsApp)
 */
class ActivityLogger {
    /**
     * Log an activity
     * @param {string} type - Event type (REGISTER, LOGIN, LOGOUT, PAYMENT, etc.)
     * @param {object} data - Activity data
     * @param {boolean} notify - Whether to send WhatsApp notification (default true for critical events)
     */
    static async log(type, data, notify = true) {
        const timestamp = new Date().toISOString();
        const logData = {
            event_type: type,
            ...data,
            logged_at: timestamp
        };

        // 1. Log to Console/File
        Logger.info('ACTIVITY', `[${type}]`, data);

        // 2. Log to Firebase Firestore
        try {
            await logToFirestore('activity_logs', logData);
        } catch (error) {
            console.error('❌ [ACTIVITY_LOGGER] Firebase logging failed:', error.message);
        }

        // 3. Sync to Google Sheets (Per Category)
        this.syncToGoogleSheets(type, logData).catch(err => {
            console.error('❌ [ACTIVITY_LOGGER] Google Sheets sync failed:', err.message);
        });

        // 4. Trigger WhatsApp Notification (Broadcast)
        // Skip notification if notify is false or event is LOGOUT (per User Feedback)
        if (notify && type !== 'LOGOUT') {
            this.triggerWhatsApp(type, data).catch(err => {
                console.error('❌ [ACTIVITY_LOGGER] WhatsApp trigger failed:', err.message);
            });
        }
    }

    /**
     * Sync data to Google Sheets
     */
    static async syncToGoogleSheets(type, data) {
        // Determine target sheet
        let targetSheet = 'Activity Logs';
        
        if (type === 'REGISTER') {
            targetSheet = 'Registrations';
        } else if (type === 'LOGIN' || type === 'LOGOUT') {
            targetSheet = 'Auth Logs';
        } else if (type.includes('PAYMENT') || type.includes('PACKAGE')) {
            targetSheet = 'Financial Logs';
        }

        // Format activity detail
        let activityDetail = '-';
        if (type.includes('PAYMENT')) {
            activityDetail = `${data.package_name || '-'} | Rp ${(data.amount || 0).toLocaleString('id-ID')}`;
            if (data.payment_id) activityDetail += ` | ID: #${data.payment_id}`;
            if (data.status) activityDetail += ` [${data.status}]`;
        } else if (type === 'REGISTER') {
            activityDetail = `Trial Status: ${data.trial_status || data.trialStatus || '-'}`;
        } else if (type === 'LOGIN' || type === 'LOGOUT') {
            activityDetail = `User Status: ${data.is_verified ? 'Verified' : 'Unverified'}`;
        } else if (data.package_name) {
            activityDetail = data.package_name;
        }

        // Prepare row data
        const row = [
            data.logged_at || new Date().toISOString(),
            type,
            data.name || data.user_name || '-',
            data.email || data.phone || '-',
            activityDetail,
            data.status || 'INFO'
        ];

        return appendRow(row, targetSheet);
    }

    /**
     * Bridge to WhatsApp Gateway
     */
    static async triggerWhatsApp(type, data) {
        // Skip if gateway disabled
        if (!waGateway.enabled) return;

        try {
            const connected = await waGateway.isConnected();
            if (connected) {
                // Determine event type for WhatsApp templates
                // Mapping local ActivityLogger types to waGateway event types
                await waGateway.sendDeveloperNotification(type, data);
            }
        } catch (error) {
            throw error;
        }
    }
}

module.exports = ActivityLogger;
