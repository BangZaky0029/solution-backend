const db = require('../config/db');

/**
 * Get daily growth statistics (Total vs Verified)
 * @returns {Promise<{total: number, verified: number}>}
 */
const getDailyGrowth = async () => {
    try {
        const query = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as verified
            FROM users
            WHERE DATE(created_at) = CURDATE()
        `;
        const [[stats]] = await db.query(query);
        return {
            total: stats.total || 0,
            verified: stats.verified || 0
        };
    } catch (error) {
        console.error('Error fetching daily growth:', error);
        return { total: 0, verified: 0 };
    }
};

/**
 * Get daily revenue statistics
 * @returns {Promise<{revenue: number, count: number}>}
 */
const getDailyFinance = async () => {
    try {
        const query = `
            SELECT 
                SUM(amount) as revenue,
                COUNT(*) as count
            FROM payments
            WHERE status = 'confirmed' AND DATE(created_at) = CURDATE()
        `;
        const [[stats]] = await db.query(query);
        return {
            revenue: stats.revenue || 0,
            count: stats.count || 0
        };
    } catch (error) {
        console.error('Error fetching daily finance:', error);
        return { revenue: 0, count: 0 };
    }
};

/**
 * Get weekly summary statistics
 */
const getWeeklySummary = async () => {
    try {
        const growthQuery = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as verified
            FROM users
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        `;
        const financeQuery = `
            SELECT 
                SUM(amount) as revenue,
                COUNT(*) as count
            FROM payments
            WHERE status = 'confirmed' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        `;
        
        const [[growth]] = await db.query(growthQuery);
        const [[finance]] = await db.query(financeQuery);
        
        return {
            growth: { total: growth.total || 0, verified: growth.verified || 0 },
            finance: { revenue: finance.revenue || 0, count: finance.count || 0 }
        };
    } catch (error) {
        console.error('Error fetching weekly summary:', error);
        return null;
    }
};

/**
 * Get monthly summary statistics
 */
const getMonthlySummary = async () => {
    try {
        const growthQuery = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as verified
            FROM users
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
        `;
        const financeQuery = `
            SELECT 
                SUM(amount) as revenue,
                COUNT(*) as count
            FROM payments
            WHERE status = 'confirmed' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
        `;
        
        const [[growth]] = await db.query(growthQuery);
        const [[finance]] = await db.query(financeQuery);
        
        return {
            growth: { total: growth.total || 0, verified: growth.verified || 0 },
            finance: { revenue: finance.revenue || 0, count: finance.count || 0 }
        };
    } catch (error) {
        console.error('Error fetching monthly summary:', error);
        return null;
    }
};

/**
 * Get yearly summary statistics
 */
const getYearlySummary = async () => {
    try {
        const growthQuery = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as verified
            FROM users
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
        `;
        const financeQuery = `
            SELECT 
                SUM(amount) as revenue,
                COUNT(*) as count
            FROM payments
            WHERE status = 'confirmed' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
        `;
        
        const [[growth]] = await db.query(growthQuery);
        const [[finance]] = await db.query(financeQuery);
        
        return {
            growth: { total: growth.total || 0, verified: growth.verified || 0 },
            finance: { revenue: finance.revenue || 0, count: finance.count || 0 }
        };
    } catch (error) {
        console.error('Error fetching yearly summary:', error);
        return null;
    }
};

/**
 * Get global cumulative statistics
 */
const getGlobalStats = async () => {
    try {
        const userQuery = `
            SELECT 
                COUNT(*) as total_users,
                SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as total_verified
            FROM users
        `;
        const activeTokenQuery = `
            SELECT 
                COUNT(*) as active_now,
                SUM(CASE WHEN DATE(activated_at) = CURDATE() THEN 1 ELSE 0 END) as activated_today
            FROM user_tokens
            WHERE is_active = 1
        `;

        const [[users]] = await db.query(userQuery);
        const [[tokens]] = await db.query(activeTokenQuery);

        return {
            totalUsers: users.total_users || 0,
            totalVerified: users.total_verified || 0,
            activeNow: tokens.active_now || 0,
            activatedToday: tokens.activated_today || 0
        };
    } catch (error) {
        console.error('Error fetching global stats:', error);
        return { totalUsers: 0, totalVerified: 0, activeNow: 0, activatedToday: 0 };
    }
};

module.exports = {
    getDailyGrowth,
    getDailyFinance,
    getGlobalStats,
    getWeeklySummary,
    getMonthlySummary,
    getYearlySummary
};
