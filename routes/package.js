const express = require('express');
const router = express.Router();
const db = require('../config/db');
const adminAuth = require('../middlewares/adminMiddleware');

// GET all packages
router.get('/', async (req, res, next) => {
  try {
    const [packages] = await db.query(
      'SELECT * FROM packages ORDER BY price ASC'
    );

    // Fetch features for each package
    const [features] = await db.query('SELECT * FROM package_features');

    const packagesWithFeatures = packages.map(pkg => {
      const pkgFeatures = features.filter(f => f.package_id === pkg.id).map(f => f.feature_id);
      return { ...pkg, feature_ids: pkgFeatures };
    });

    res.json(packagesWithFeatures);
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

    const pkg = rows[0];
    const [features] = await db.query(
      'SELECT feature_id FROM package_features WHERE package_id = ?',
      [pkg.id]
    );

    pkg.feature_ids = features.map(f => f.feature_id);

    res.json(pkg);
  } catch (err) {
    next(err);
  }
});

// CREATE package (Transaction)
router.post('/', adminAuth, async (req, res, next) => {
  let connection;
  try {
    const { name, price, duration_days, feature_ids } = req.body;

    connection = await db.getConnection();
    await connection.beginTransaction();

    // 1. Determine Description (Manual Override vs Auto-Generated)
    let descriptionValue;

    if (req.body.description && req.body.description.trim().length > 0) {
      descriptionValue = req.body.description;
    } else {
      // Auto-generate from features
      let featureNames = [];
      if (feature_ids && feature_ids.length > 0) {
        const [featureRows] = await connection.query(
          'SELECT name FROM features WHERE id IN (?)',
          [feature_ids]
        );
        featureNames = featureRows.map(f => f.name);
      }
      descriptionValue = JSON.stringify(featureNames);
    }

    // 2. Insert Package
    const [result] = await connection.query(
      `INSERT INTO packages (name, price, duration_days, description, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [name, price, duration_days, descriptionValue, 1]
    );

    const packageId = result.insertId;

    // 3. Insert Relations
    if (feature_ids && feature_ids.length > 0) {
      const values = feature_ids.map(fid => [packageId, fid]);
      await connection.query(
        'INSERT INTO package_features (package_id, feature_id) VALUES ?',
        [values]
      );
    }

    await connection.commit();

    res.status(201).json({
      message: 'Package created successfully',
      id: packageId
    });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
});

// UPDATE package (Transaction)
router.put('/:id', adminAuth, async (req, res, next) => {
  let connection;
  try {
    const { name, price, duration_days, feature_ids } = req.body;
    const packageId = req.params.id;

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Check if exists
    const [check] = await connection.query('SELECT id FROM packages WHERE id = ? FOR UPDATE', [packageId]);
    if (!check.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Package not found' });
    }

    // 1. Determine Description (Manual Override vs Auto-Generated)
    let descriptionValue;

    if (req.body.description && req.body.description.trim().length > 0) {
      descriptionValue = req.body.description;
    } else {
      // Auto-generate from features
      let featureNames = [];
      if (feature_ids && feature_ids.length > 0) {
        const [featureRows] = await connection.query(
          'SELECT name FROM features WHERE id IN (?)',
          [feature_ids]
        );
        featureNames = featureRows.map(f => f.name);
      }
      descriptionValue = JSON.stringify(featureNames);
    }

    // 2. Update Package
    await connection.query(
      `UPDATE packages
       SET name = ?, price = ?, duration_days = ?, description = ?
       WHERE id = ?`,
      [name, price, duration_days, descriptionValue, packageId]
    );

    // 3. Update Relations (Delete All + Insert New)
    await connection.query('DELETE FROM package_features WHERE package_id = ?', [packageId]);

    if (feature_ids && feature_ids.length > 0) {
      const values = feature_ids.map(fid => [packageId, fid]);
      await connection.query(
        'INSERT INTO package_features (package_id, feature_id) VALUES ?',
        [values]
      );
    }

    await connection.commit();

    res.json({ message: 'Package updated successfully' });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
});

// DELETE package (Transaction)
router.delete('/:id', adminAuth, async (req, res, next) => {
  let connection;
  try {
    const packageId = req.params.id;
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Delete relations first (though FK cascade usually handles this, let's be safe)
    await connection.query('DELETE FROM package_features WHERE package_id = ?', [packageId]);

    // Delete tokens? Maybe not, keep history. But deactivate them?
    // For now, simple delete.

    const [result] = await connection.query(
      'DELETE FROM packages WHERE id = ?',
      [packageId]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Package not found' });
    }

    await connection.commit();
    res.json({ message: 'Package deleted successfully' });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
