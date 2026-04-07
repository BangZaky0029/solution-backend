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

    // 2. DAILY RECAP - Every day at 23:59 PM
    cron.schedule('59 23 * * *', async () => {
        Logger.info('CRON', 'Running Daily Recap Analytic Report');
        try {
            const todayGrowth = await statsHelper.getDailyGrowth();
            const todayFinance = await statsHelper.getDailyFinance();
            const globalStats = await statsHelper.getGlobalStats();

            if (!todayGrowth || !globalStats) return;

            const message = `🌙 *[DAILY RECAP] - STATUS PLATFORM*\n` +
                            `----------------------------------\n` +
                            `📅 *Tanggal:* ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}\n\n` +
                            `📈 *Pertumbuhan Hari Ini:*\n` +
                            `• Registrasi Baru: ${todayGrowth.total} User\n` +
                            `• Terverifikasi: ${todayGrowth.verified} User\n` +
                            `• Paket Dibeli: ${todayFinance.count} Transaksi\n\n` +
                            `⚡ *Status Aktivitas:* \n` +
                            `• Paket Aktif Harian: ${globalStats.activatedToday} User\n` +
                            `• Total User Aktif (Global): ${globalStats.activeNow} User\n\n` +
                            `👥 *Akumulasi User (All-Time):*\n` +
                            `• Total User Terdaftar: ${globalStats.totalUsers.toLocaleString('id-ID')} User\n` +
                            `• Total User Terverifikasi: ${globalStats.totalVerified.toLocaleString('id-ID')} User\n\n` +
                            `🕒 *Waktu Laporan:* 23:59 WIB\n` +
                            `----------------------------------\n` +
                            `_Laporan performa & kesehatan sistem_`;

            await waGateway._fetch('/api/whatsapp/main-session/notify/developer', 'POST', { message });
            Logger.info('CRON', 'Daily Recap Sent');
        } catch (error) {
            Logger.error('CRON', 'Daily Recap Failed', error);
        }
    });

    // 3. MONTHLY REPORT - Every 1st of the Month at 08:05 AM
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
