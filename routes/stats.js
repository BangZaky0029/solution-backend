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

module.exports = router;
