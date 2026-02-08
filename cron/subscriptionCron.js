/**
 * ============================================
 * Subscription Reminder Cron Job
 * ============================================
 * 
 * Sends WhatsApp reminders to users whose subscriptions
 * are about to expire (7, 3, 1 days before)
 * 
 * Run this with node-cron or as a daily scheduled task
 */

const db = require('../config/db');
const Logger = require('../utils/logger');
const waGateway = require('../utils/whatsappGateway');

/**
 * Check for expiring subscriptions and send reminders
 * @param {number[]} daysBeforeExpiry - Array of days to check (e.g., [7, 3, 1])
 */
async function sendExpiryReminders(daysBeforeExpiry = [7, 3, 1]) {
    Logger.info('CRON', 'Starting subscription expiry check...');

    try {
        // Check if WhatsApp is connected
        const connected = await waGateway.isConnected();
        if (!connected) {
            Logger.warn('CRON', 'WhatsApp Gateway not connected, skipping reminders');
            return { sent: 0, skipped: 0, errors: 0 };
        }

        let totalSent = 0;
        let totalSkipped = 0;
        let totalErrors = 0;

        for (const days of daysBeforeExpiry) {
            Logger.info('CRON', `Checking subscriptions expiring in ${days} days...`);

            // Find users with subscriptions expiring in X days
            const [expiringUsers] = await db.query(`
                SELECT 
                    u.id AS user_id,
                    u.name,
                    u.phone,
                    ut.package_id,
                    pk.name AS package_name,
                    ut.expired_at,
                    DATEDIFF(ut.expired_at, NOW()) AS days_left
                FROM user_tokens ut
                JOIN users u ON u.id = ut.user_id
                JOIN packages pk ON pk.id = ut.package_id
                WHERE ut.is_active = 1 
                  AND ut.is_trial = 0
                  AND DATEDIFF(ut.expired_at, NOW()) = ?
            `, [days]);

            Logger.info('CRON', `Found ${expiringUsers.length} users expiring in ${days} days`);

            for (const user of expiringUsers) {
                try {
                    // Check if we already sent a reminder today for this user
                    const [existingReminder] = await db.query(`
                        SELECT id FROM subscription_reminders
                        WHERE user_id = ? 
                          AND days_before = ?
                          AND DATE(sent_at) = CURDATE()
                    `, [user.user_id, days]);

                    if (existingReminder.length > 0) {
                        Logger.info('CRON', `Already sent ${days}-day reminder to ${user.phone} today`);
                        totalSkipped++;
                        continue;
                    }

                    // Format expiry date
                    const expiryDate = new Date(user.expired_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                    });

                    // Send reminder
                    await waGateway.sendSubscriptionReminder(user.phone, {
                        userName: user.name,
                        packageName: user.package_name,
                        daysLeft: days,
                        expiryDate: expiryDate
                    });

                    // Record that we sent this reminder
                    await db.query(`
                        INSERT INTO subscription_reminders (user_id, days_before, sent_at)
                        VALUES (?, ?, NOW())
                    `, [user.user_id, days]);

                    Logger.whatsapp('SUBSCRIPTION_REMINDER', `Sent ${days}-day reminder to ${user.phone}`, {
                        userId: user.user_id,
                        packageName: user.package_name
                    });

                    totalSent++;
                } catch (error) {
                    Logger.error('CRON', `Failed to send reminder to ${user.phone}`, error);
                    totalErrors++;
                }
            }
        }

        Logger.info('CRON', `Subscription reminder complete: ${totalSent} sent, ${totalSkipped} skipped, ${totalErrors} errors`);

        return {
            sent: totalSent,
            skipped: totalSkipped,
            errors: totalErrors
        };
    } catch (error) {
        Logger.error('CRON', 'Error in subscription reminder cron', error);
        throw error;
    }
}

/**
 * Initialize cron job (if using node-cron)
 * Run daily at 9:00 AM
 */
function initCron() {
    try {
        const cron = require('node-cron');

        // Run daily at 9:00 AM
        cron.schedule('0 9 * * *', async () => {
            Logger.info('CRON', '⏰ Daily subscription reminder cron started');
            await sendExpiryReminders([7, 3, 1]);
        }, {
            timezone: 'Asia/Jakarta'
        });

        Logger.info('CRON', '✅ Subscription reminder cron initialized (9:00 AM daily)');
    } catch (error) {
        Logger.warn('CRON', 'node-cron not installed, cron job not initialized');
    }
}

module.exports = {
    sendExpiryReminders,
    initCron
};
