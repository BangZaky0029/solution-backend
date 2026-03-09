// =========================================
// FILE: utils/cron.js - OPTIMIZED (Distributed Locking)
// Enhanced with Package Expiry Notifications & Concurrency Safety
// =========================================

const db = require('../config/db');
const Logger = require('./logger');
const ActivityLogger = require('./activityLogger');
const waGateway = require('./whatsappGateway');
const { WhatsAppTemplates, formatDate } = require('./whatsappTemplates');

/**
 * Execute a job with distributed locking
 * Ensures only one instance runs the job at a time
 */
async function runWithLock(jobName, jobFunction) {
  let connection;
  try {
    // Get dedicated connection for the lock duration
    connection = await db.getConnection();

    // Try to acquire lock immediately (timeout 0)
    const [result] = await connection.query(
      'SELECT GET_LOCK(?, 0) as locked',
      [`cron_${jobName}`] // Namespace the lock
    );

    const isLocked = result[0].locked === 1;

    if (!isLocked) {
      Logger.info('CRON', `Job ${jobName} skipped - Lock held by another instance`);
      return;
    }

    try {
      Logger.info('CRON', `Job ${jobName} started`);
      await jobFunction();
    } catch (err) {
      Logger.error('CRON', `Job ${jobName} failed`, err);
    } finally {
      // Release lock
      await connection.query('SELECT RELEASE_LOCK(?)', [`cron_${jobName}`]);
    }

  } catch (err) {
    Logger.error('CRON', `System error in job wrapper ${jobName}`, err);
  } finally {
    if (connection) connection.release();
  }
}

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
    const connected = await waGateway.isConnected();
    if (!connected) {
      Logger.whatsapp('EXPIRY_NOTIFICATION_SKIPPED', 'WhatsApp Gateway not ready');
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

        await waGateway.sendMessage(user.phone, message);

        Logger.whatsapp('PACKAGE_EXPIRED', `Expiry notification sent to ${user.phone}`, {
          userId: user.id
        });

        // Notify Dev
        await waGateway.sendDeveloperNotification('PACKAGE_EXPIRED', {
          userName: user.name,
          phone: user.phone,
          packageName: user.package_name
        });

        // Log activity to Firebase
        ActivityLogger.log('PACKAGE_EXPIRED', {
          user_id: user.id,
          user_name: user.name,
          phone: user.phone,
          package_name: user.package_name
        }).catch(console.error);

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
    const connected = await waGateway.isConnected();
    if (!connected) {
      Logger.whatsapp('EXPIRING_NOTIFICATION_SKIPPED', 'WhatsApp Gateway not ready');
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

        await waGateway.sendMessage(user.phone, message);

        Logger.whatsapp('PACKAGE_EXPIRING', `Expiring notification sent to ${user.phone}`, {
          userId: user.id,
          daysLeft: user.days_left
        });

        // Notify Dev
        await waGateway.sendDeveloperNotification('PACKAGE_EXPIRING_SOON', {
          userName: user.name,
          phone: user.phone,
          packageName: user.package_name,
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
// Wrapper function to handle the lock logic
setInterval(() => {
  runWithLock('expire_tokens', expireTokens);
}, 60 * 1000);

// Run expiring soon notifications once per day at 10:00 AM
// Check every minute if it's 10:00 AM, then try to lock 'daily_notification'
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 10 && now.getMinutes() === 0) {
    runWithLock('daily_notification', sendExpiringSoonNotifications);
  }
}, 60000);

Logger.info('CRON', 'Cron jobs initialized with Distributed Locking');