const cron = require('node-cron');
const statsHelper = require('../utils/statsHelper');
const waGateway = require('../utils/whatsappGateway');
const Logger = require('../utils/logger');

/**
 * Initialize Analytic Report Cron Jobs
 */
const initAnalyticCron = () => {
    if (process.env.WHATSAPP_ENABLED !== 'true') return;

    // 1. WEEKLY REPORT - Every Monday at 08:00 AM
    cron.schedule('0 8 * * 1', async () => {
        Logger.info('CRON', 'Running Weekly Analytic Report');
        try {
            const summary = await statsHelper.getWeeklySummary();
            if (!summary) return;

            const message = `📊 *[WEEKLY REPORT] - NUANSA SUMMARY*\n` +
                            `----------------------------------\n` +
                            `📅 *Periode:* 7 Hari Terakhir\n\n` +
                            `📈 *User Growth:*\n` +
                            `• Total Registrasi: ${summary.growth.total} User\n` +
                            `• Terverifikasi: ${summary.growth.verified} User\n\n` +
                            `💰 *Financial Analysis:*\n` +
                            `• Total Revenue: Rp ${new Intl.NumberFormat('id-ID').format(summary.finance.revenue)}\n` +
                            `• Total Transaksi: ${summary.finance.count} Berhasil\n\n` +
                            `🕒 *Waktu Laporan:* ${new Date().toLocaleString('id-ID')}\n` +
                            `----------------------------------\n` +
                            `_Laporan mingguan otomatis sistem_`;

            await waGateway._fetch('/api/whatsapp/main-session/notify/developer', 'POST', { message });
            Logger.info('CRON', 'Weekly Report Sent');
        } catch (error) {
            Logger.error('CRON', 'Weekly Report Failed', error);
        }
    });

    // 2. MONTHLY REPORT - Every 1st of the Month at 08:05 AM
    cron.schedule('5 8 1 * *', async () => {
        Logger.info('CRON', 'Running Monthly Analytic Report');
        try {
            const summary = await statsHelper.getMonthlySummary();
            if (!summary) return;

            const message = `📅 *[MONTHLY REPORT] - PERFORMANCE SUMMARY*\n` +
                            `----------------------------------\n` +
                            `🗓️ *Bulan:* ${new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' })}\n\n` +
                            `📈 *User Growth:*\n` +
                            `• Total Registrasi: ${summary.growth.total} User\n` +
                            `• Terverifikasi: ${summary.growth.verified} User\n\n` +
                            `💰 *Financial Analysis:*\n` +
                            `• Total Revenue: Rp ${new Intl.NumberFormat('id-ID').format(summary.finance.revenue)}\n` +
                            `• Total Transaksi: ${summary.finance.count} Berhasil\n\n` +
                            `🕒 *Waktu Laporan:* ${new Date().toLocaleString('id-ID')}\n` +
                            `----------------------------------\n` +
                            `_Laporan bulanan otomatis sistem_`;

            await waGateway._fetch('/api/whatsapp/main-session/notify/developer', 'POST', { message });
            Logger.info('CRON', 'Monthly Report Sent');
        } catch (error) {
            Logger.error('CRON', 'Monthly Report Failed', error);
        }
    });

    // 3. YEARLY REPORT - January 1st at 09:00 AM
    cron.schedule('0 9 1 1 *', async () => {
        Logger.info('CRON', 'Running Yearly Analytic Report');
        try {
            const summary = await statsHelper.getYearlySummary();
            if (!summary) return;

            const message = `🏆 *[YEARLY REPORT] - ANNUAL SUMMARY*\n` +
                            `----------------------------------\n` +
                            `🌟 *Tahun:* ${new Date().getFullYear()}\n\n` +
                            `📈 *User Growth:*\n` +
                            `• Total Registrasi: ${summary.growth.total} User\n` +
                            `• Terverifikasi: ${summary.growth.verified} User\n\n` +
                            `💰 *Financial Analysis:*\n` +
                            `• Total Revenue: Rp ${new Intl.NumberFormat('id-ID').format(summary.finance.revenue)}\n` +
                            `• Total Transaksi: ${summary.finance.count} Berhasil\n\n` +
                            `🕒 *Waktu Laporan:* ${new Date().toLocaleString('id-ID')}\n` +
                            `----------------------------------\n` +
                            `_Laporan tahunan otomatis sistem_`;

            await waGateway._fetch('/api/whatsapp/main-session/notify/developer', 'POST', { message });
            Logger.info('CRON', 'Yearly Report Sent');
        } catch (error) {
            Logger.error('CRON', 'Yearly Report Failed', error);
        }
    });

    Logger.info('CRON', 'Analytic Report Cron Jobs initialized');
};

module.exports = { initAnalyticCron };
