// ==========================================
// routes/package.js - Package Management
// ==========================================
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const adminAuth = require('../middlewares/adminMiddleware');

// GET all packages (public)
router.get('/', (req, res) => {
  db.query('SELECT * FROM packages ORDER BY price ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET package by ID
router.get('/:id', (req, res) => {
  db.query('SELECT * FROM packages WHERE id=?', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows.length) return res.status(404).json({ message: 'Package not found' });
    res.json(rows[0]);
  });
});

// CREATE package (admin only)
router.post('/', adminAuth, (req, res) => {
  const { name, price, duration_days, features } = req.body;
  
  db.query(
    'INSERT INTO packages (name, price, duration_days, features) VALUES (?, ?, ?, ?)',
    [name, price, duration_days, JSON.stringify(features)],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ 
        message: 'Package created successfully', 
        id: result.insertId 
      });
    }
  );
});

// UPDATE package (admin only)
router.put('/:id', adminAuth, (req, res) => {
  const { name, price, duration_days, features } = req.body;
  
  db.query(
    'UPDATE packages SET name=?, price=?, duration_days=?, features=? WHERE id=?',
    [name, price, duration_days, JSON.stringify(features), req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Package not found' });
      }
      res.json({ message: 'Package updated successfully' });
    }
  );
});

// DELETE package (admin only)
router.delete('/:id', adminAuth, (req, res) => {
  db.query('DELETE FROM packages WHERE id=?', [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Package not found' });
    }
    res.json({ message: 'Package deleted successfully' });
  });
});

module.exports = router;