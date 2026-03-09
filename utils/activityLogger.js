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
        const row = [
            data.logged_at || new Date().toISOString(),
            type,
            data.user_name || data.name || '-',
            data.phone || data.email || '-',
            JSON.stringify(data.package_name || data.amount || data.trial_status || '-'),
            'SUCCESS'
        ];

        return appendRow(row);
    }
}

module.exports = ActivityLogger;
