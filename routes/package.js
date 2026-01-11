const express = require('express');
const router = express.Router();
const db = require('../config/db');
const adminAuth = require('../middlewares/adminMiddleware');

// GET all packages (public)
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM packages ORDER BY price ASC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET package by ID
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM packages WHERE id = ?',
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Package not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// CREATE package (admin only)
router.post('/', adminAuth, async (req, res, next) => {
  try {
    const { name, price, duration_days, features } = req.body;

    const [result] = await db.query(
      `INSERT INTO packages (name, price, duration_days, features)
       VALUES (?, ?, ?, ?)`,
      [name, price, duration_days, JSON.stringify(features)]
    );

    res.status(201).json({
      message: 'Package created successfully',
      id: result.insertId
    });
  } catch (err) {
    next(err);
  }
});

// UPDATE package (admin only)
router.put('/:id', adminAuth, async (req, res, next) => {
  try {
    const { name, price, duration_days, features } = req.body;

    const [result] = await db.query(
      `UPDATE packages
       SET name = ?, price = ?, duration_days = ?, features = ?
       WHERE id = ?`,
      [name, price, duration_days, JSON.stringify(features), req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Package not found' });
    }

    res.json({ message: 'Package updated successfully' });
  } catch (err) {
    next(err);
  }
});

// DELETE package (admin only)
router.delete('/:id', adminAuth, async (req, res, next) => {
  try {
    const [result] = await db.query(
      'DELETE FROM packages WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Package not found' });
    }

    res.json({ message: 'Package deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
