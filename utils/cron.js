// =========================================
// FILE: utils/cron.js - UPDATED
// Enhanced with Package Expiry Notifications
// =========================================

const db = require('../config/db');
const Logger = require('./logger');
const whatsappClient = require('./whatsappClient');
const { WhatsAppTemplates, formatDate } = require('./whatsappTemplates');

/**
 * Expire tokens that have passed expiry date
 */
async function expireTokens() {
  try {
    const [result] = await db.query(
      `UPDATE user_tokens
       SET is_active=0
       WHERE expired_at < NOW() AND is_active=1`
    );

    if (result.affectedRows > 0) {
      Logger.info('CRON', `Expired ${result.affectedRows} tokens`);

      // Send expiry notifications
      await sendExpiryNotifications();
    }

  } catch (err) {
    Logger.error('CRON', 'Error expiring tokens', err);
  }
}

/**
 * Send expiry notifications to users
 */
async function sendExpiryNotifications() {
  try {
    if (!whatsappClient.isReady) {
      Logger.whatsapp('EXPIRY_NOTIFICATION_SKIPPED', 'WhatsApp not ready');
      return;
    }

    // Get users with just expired packages
    const [expiredUsers] = await db.query(
      `SELECT 
        u.id,
        u.name,
        u.phone,
        p.name as package_name,
        ut.expired_at
       FROM user_tokens ut
       JOIN users u ON u.id = ut.user_id
       JOIN packages p ON p.id = ut.package_id
       WHERE ut.is_active = 0
       AND ut.expired_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
       AND ut.expired_at < NOW()
       AND u.is_verified = 1`
    );

    for (const user of expiredUsers) {
      try {
        const message = WhatsAppTemplates.packageExpired(
          user.name,
          user.package_name
        );

        await whatsappClient.sendMessage(user.phone, message);

        Logger.whatsapp('PACKAGE_EXPIRED', `Expiry notification sent to ${user.phone}`, {
          userId: user.id
        });

      } catch (error) {
        Logger.error('WHATSAPP', `Failed to send expiry notification to ${user.phone}`, error);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  } catch (err) {
    Logger.error('CRON', 'Error sending expiry notifications', err);
  }
}

/**
 * Send expiring soon notifications (3 days before)
 */
async function sendExpiringSoonNotifications() {
  try {
    if (!whatsappClient.isReady) {
      Logger.whatsapp('EXPIRING_NOTIFICATION_SKIPPED', 'WhatsApp not ready');
      return;
    }

    // Get users with packages expiring in 3 days
    const [expiringUsers] = await db.query(
      `SELECT 
        u.id,
        u.name,
        u.phone,
        p.name as package_name,
        ut.expired_at,
        DATEDIFF(ut.expired_at, NOW()) as days_left
       FROM user_tokens ut
       JOIN users u ON u.id = ut.user_id
       JOIN packages p ON p.id = ut.package_id
       WHERE ut.is_active = 1
       AND DATEDIFF(ut.expired_at, NOW()) = 3
       AND u.is_verified = 1`
    );

    for (const user of expiringUsers) {
      try {
        const expiryDateStr = formatDate(user.expired_at);
        const message = WhatsAppTemplates.packageExpiring(
          user.name,
          user.package_name,
          user.days_left,
          expiryDateStr
        );

        await whatsappClient.sendMessage(user.phone, message);

        Logger.whatsapp('PACKAGE_EXPIRING', `Expiring notification sent to ${user.phone}`, {
          userId: user.id,
          daysLeft: user.days_left
        });

      } catch (error) {
        Logger.error('WHATSAPP', `Failed to send expiring notification to ${user.phone}`, error);
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  } catch (err) {
    Logger.error('CRON', 'Error sending expiring notifications', err);
  }
}

// Run every 1 minute (token expiry check)
setInterval(expireTokens, 60 * 1000);

// Run expiring soon notifications once per day at 10:00 AM
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 10 && now.getMinutes() === 0) {
    sendExpiringSoonNotifications();
  }
}, 60000); // Check every minute

Logger.info('CRON', 'Cron jobs initialized');