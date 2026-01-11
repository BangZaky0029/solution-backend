const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET all features
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM features ORDER BY id ASC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET feature by ID
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM features WHERE id = ?',
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Feature not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
