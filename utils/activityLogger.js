const { logToFirestore } = require('./firebaseAdmin');
const { appendRow } = require('./googleSheetsService');
const Logger = require('./logger');

/**
 * Activity Logger Service
 * Centralizes all logging activity to external services (Firebase, Google Sheets)
 */
class ActivityLogger {
    /**
     * Log an activity
     * @param {string} type - Event type (REGISTER, LOGIN, PAYMENT, etc.)
     * @param {object} data - Activity data
     */
    static async log(type, data) {
        const timestamp = new Date().toISOString();
        const logData = {
            event_type: type,
            ...data,
            logged_at: timestamp
        };

        // 1. Log to Console/File (Existing system)
        Logger.info('ACTIVITY', `[${type}]`, data);

        // 2. Log to Firebase Firestore
        try {
            await logToFirestore('activity_logs', logData);
        } catch (error) {
            console.error('❌ [ACTIVITY_LOGGER] Firebase logging failed:', error.message);
        }

        // 3. Log to Google Sheets (To be implemented once ID provided and deps installed)
        // This will be handled in a separate service called from here
        this.syncToGoogleSheets(type, logData).catch(err => {
            console.error('❌ [ACTIVITY_LOGGER] Google Sheets sync failed:', err.message);
        });
    }

    /**
     * Sync data to Google Sheets
     */
    static async syncToGoogleSheets(type, data) {
        // 1. Determine which sub-sheet to use
        let targetSheet = process.env.GOOGLE_SHEET_NAME || 'Activity Logs';

        if (type === 'REGISTER' || type === 'LOGIN') {
            targetSheet = process.env.USER_LOG_SHEET_NAME || 'User Logs';
        } else if (type.includes('PAYMENT') || type.includes('PACKAGE')) {
            targetSheet = process.env.PAYMENT_LOG_SHEET_NAME || 'Payment Logs';
        }

        // 2. Format a human-readable activity description
        let activityDetail = '-';
        if (type.includes('PAYMENT')) {
            activityDetail = `${data.package_name || '-'} | Rp ${(data.amount || 0).toLocaleString('id-ID')}`;
            if (data.payment_id) activityDetail += ` | ID: #${data.payment_id}`;
        } else if (type === 'REGISTER') {
            activityDetail = `Trial: ${data.trial_status || '-'}`;
        } else if (data.package_name) {
            activityDetail = data.package_name;
        }

        // 3. Prepare row data
        const row = [
            data.logged_at || new Date().toISOString(),
            type,
            data.user_name || data.name || '-',
            data.phone || data.email || '-',
            activityDetail,
            data.status || 'SUCCESS'
        ];

        return appendRow(row, targetSheet);
    }
}

module.exports = ActivityLogger;
