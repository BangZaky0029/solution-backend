const db = require('../config/db');

/**
 * GET FINANCE SUMMARY
 * Total Revenue, Pending Revenue, MTD Revenue
 */
exports.getFinanceSummary = async (req, res) => {
  try {
    const [[total]] = await db.query('SELECT SUM(amount) as total FROM payments WHERE status="confirmed"');
    const [[pending]] = await db.query('SELECT SUM(amount) as total FROM payments WHERE status="pending"');
    
    const [[mtd]] = await db.query(`
      SELECT SUM(amount) as total 
      FROM payments 
      WHERE status="confirmed" 
      AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
    `);

    res.json({
      success: true,
      data: {
        totalRevenue: total.total || 0,
        pendingRevenue: pending.total || 0,
        mtdRevenue: mtd.total || 0
      }
    });
  } catch (error) {
    console.error('[FINANCE_SUMMARY_ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET REVENUE BREAKDOWN
 * Revenue by Package and Payment Method
 */
exports.getRevenueBreakdown = async (req, res) => {
  try {
    // 1. By Package
    const [packages] = await db.query(`
      SELECT pk.name, SUM(p.amount) as value
      FROM payments p
      JOIN packages pk ON pk.id = p.package_id
      WHERE p.status = 'confirmed'
      GROUP BY pk.id
      ORDER BY value DESC
    `);

    // 2. By Method
    const [methods] = await db.query(`
      SELECT payment_method as name, SUM(amount) as value
      FROM payments
      WHERE status = 'confirmed'
      GROUP BY payment_method
    `);

    res.json({
      success: true,
      data: {
        byPackage: packages,
        byMethod: methods
      }
    });
  } catch (error) {
    console.error('[FINANCE_BREAKDOWN_ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET FINANCE LOGS (AUDIT READY)
 * Full transaction list with user info
 */
exports.getFinanceLogs = async (req, res) => {
  try {
    const { status, method, startDate, endDate } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (status) {
      whereClause += ' AND p.status = ?';
      params.push(status);
    }
    if (method) {
      whereClause += ' AND p.payment_method = ?';
      params.push(method);
    }
    if (startDate && endDate) {
      whereClause += ' AND p.created_at BETWEEN ? AND ?';
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    const query = `
      SELECT 
        p.id, 
        u.name as user_name, 
        u.email as user_email, 
        u.phone as user_phone, 
        pk.name as package_name, 
        p.amount, 
        p.payment_method, 
        p.status, 
        p.created_at
      FROM payments p
      JOIN users u ON u.id = p.user_id
      JOIN packages pk ON pk.id = p.package_id
      ${whereClause}
      ORDER BY p.created_at DESC
    `;

    const [rows] = await db.query(query, params);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('[FINANCE_LOGS_ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET REVENUE TRENDS
 */
exports.getRevenueTrends = async (req, res) => {
    try {
        const { period = '30d' } = req.query;
        let interval = '30 DAY';
        let format = '%Y-%m-%d';

        if (period === '90d') interval = '90 DAY';
        if (period === '1y') {
            interval = '1 YEAR';
            format = '%Y-%m';
        }

        const query = `
            SELECT 
                DATE_FORMAT(created_at, ?) as label, 
                SUM(amount) as revenue 
            FROM payments 
            WHERE status = 'confirmed' 
            AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
            GROUP BY label 
            ORDER BY label ASC
        `;

        const [rows] = await db.query(query, [format]);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[FINANCE_TRENDS_ERROR]', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
