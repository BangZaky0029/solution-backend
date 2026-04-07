const express = require('express');
const router = express.Router();
const db = require('../config/db');
const adminAuth = require('../middlewares/adminMiddleware');

// GET all dashboard statistics (admin only)
router.get('/', adminAuth, async (req, res) => {
  try {
    const stats = {};

    const [[users]] = await db.query('SELECT COUNT(*) as count FROM users');
    stats.totalUsers = users.count;

    const [[payments]] = await db.query('SELECT COUNT(*) as count FROM payments');
    stats.totalPayments = payments.count;

    const [[pending]] = await db.query(
      'SELECT COUNT(*) as count FROM payments WHERE status="pending"'
    );
    stats.pendingPayments = pending.count;

    const [[confirmed]] = await db.query(
      'SELECT COUNT(*) as count FROM payments WHERE status="confirmed"'
    );
    stats.confirmedPayments = confirmed.count;

    const [[active]] = await db.query(
      'SELECT COUNT(*) as count FROM user_tokens WHERE expired_at > NOW()'
    );
    stats.activeSubscriptions = active.count;

    const [[revenue]] = await db.query(
      'SELECT SUM(amount) as total FROM payments WHERE status="confirmed"'
    );
    stats.totalRevenue = revenue.total || 0;

    res.json(stats);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil statistik'
    });
  }
});

// GET monthly statistics
router.get('/monthly', adminAuth, async (req, res) => {
  try {
    const query = `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as payments,
        SUM(amount) as revenue
      FROM payments
      WHERE status='confirmed'
        AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month
      ORDER BY month ASC
    `;

    const [rows] = await db.query(query);
    res.json(rows);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET recent activities
router.get('/activities', adminAuth, async (req, res) => {
  try {
    const query = `
      SELECT 
        'payment' as type,
        p.id,
        p.created_at,
        u.name as user_name,
        p.amount
      FROM payments p
      JOIN users u ON u.id = p.user_id
      WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY p.created_at DESC
      LIMIT 10
    `;

    const [rows] = await db.query(query);
    res.json(rows);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET user registration growth
router.get('/user-growth', adminAuth, async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    let format = '%Y-%m-%d';
    let interval = '30 DAY';

    if (period === 'weekly') {
      format = '%Y-%u'; // Year-WeekNumber
      interval = '12 WEEK';
    } else if (period === 'monthly') {
      format = '%Y-%m';
      interval = '12 MONTH';
    } else if (period === 'yearly') {
      format = '%Y';
      interval = '5 YEAR';
    }

    const query = `
      SELECT 
        DATE_FORMAT(created_at, ?) as label,
        COUNT(*) as total,
        SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as verified
      FROM users
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      GROUP BY label
      ORDER BY label ASC
    `;

    const [rows] = await db.query(query, [format]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET payment methods distribution
router.get('/payment-methods', adminAuth, async (req, res) => {
  try {
    const query = `
      SELECT 
        payment_method as name,
        COUNT(*) as value
      FROM payments
      WHERE status = 'confirmed'
      GROUP BY payment_method
    `;

    const [rows] = await db.query(query);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET package popularity
router.get('/package-popularity', adminAuth, async (req, res) => {
  try {
    const query = `
      SELECT 
        pk.name,
        COUNT(*) as count
      FROM payments p
      JOIN packages pk ON pk.id = p.package_id
      WHERE p.status = 'confirmed'
      GROUP BY pk.id
      ORDER BY count DESC
    `;

    const [rows] = await db.query(query);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
