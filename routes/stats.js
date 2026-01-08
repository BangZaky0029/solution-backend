
// ==========================================
// routes/stats.js - Dashboard Statistics
// ==========================================
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const adminAuth = require('../middlewares/adminMiddleware');

// GET all dashboard statistics (admin only)
router.get('/', adminAuth, (req, res) => {
  const stats = {};

  // Get user statistics
  db.query('SELECT COUNT(*) as count FROM users', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    stats.totalUsers = rows[0].count;

    // Get total payments
    db.query('SELECT COUNT(*) as count FROM payments', (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      stats.totalPayments = rows[0].count;

      // Get pending payments
      db.query('SELECT COUNT(*) as count FROM payments WHERE status="pending"', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        stats.pendingPayments = rows[0].count;

        // Get confirmed payments
        db.query('SELECT COUNT(*) as count FROM payments WHERE status="confirmed"', (err, rows) => {
          if (err) return res.status(500).json({ error: err.message });
          stats.confirmedPayments = rows[0].count;

          // Get active tokens
          db.query('SELECT COUNT(*) as count FROM user_tokens WHERE expired_at > NOW()', (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            stats.activeSubscriptions = rows[0].count;

            // Get revenue
            db.query('SELECT SUM(amount) as total FROM payments WHERE status="confirmed"', (err, rows) => {
              if (err) return res.status(500).json({ error: err.message });
              stats.totalRevenue = rows[0].total || 0;

              res.json(stats);
            });
          });
        });
      });
    });
  });
});

// GET monthly statistics (admin only)
router.get('/monthly', adminAuth, (req, res) => {
  const query = `
    SELECT 
      DATE_FORMAT(created_at, '%Y-%m') as month,
      COUNT(*) as payments,
      SUM(amount) as revenue
    FROM payments
    WHERE status='confirmed' AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY month
    ORDER BY month ASC
  `;

  db.query(query, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET recent activities (admin only)
router.get('/activities', adminAuth, (req, res) => {
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

  db.query(query, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

module.exports = router;