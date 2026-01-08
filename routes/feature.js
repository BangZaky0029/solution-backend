// ==========================================
// routes/feature.js - UPDATED
// ==========================================
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET all features
router.get('/', (req, res) => {
  db.query('SELECT * FROM features ORDER BY id ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET feature by ID
router.get('/:id', (req, res) => {
  db.query('SELECT * FROM features WHERE id=?', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows.length) return res.status(404).json({ message: 'Feature not found' });
    res.json(rows[0]);
  });
});

module.exports = router;