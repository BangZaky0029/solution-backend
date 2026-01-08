const db = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

exports.login = (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM admins WHERE email=?', [email], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error', error: err });
    if (!rows.length) return res.status(404).json({ message: 'Admin not found' });

    if (!bcrypt.compareSync(password, rows[0].password))
      return res.status(401).json({ message: 'Wrong password' });

    const token = jwt.sign({ id: rows[0].id, role: 'admin' }, process.env.JWT_SECRET);
    res.json({ token });
  });
};

exports.payments = (req, res) => {
  db.query(
    `SELECT 
      p.id,
      p.id as payment_id,
      COALESCE(pc.email, u.email) as email,
      COALESCE(pc.phone, u.phone) as phone,
      pc.proof_image,
      p.created_at,
      p.status,
      p.amount,
      pk.name as package_name
     FROM payments p
     LEFT JOIN packages pk ON pk.id = p.package_id
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN payment_confirmations pc ON pc.payment_id = p.id
     WHERE p.status = 'pending'
     ORDER BY p.created_at DESC`,
    (err, rows) => {
      if (err) {
        console.error('Error fetching payments:', err);
        return res.status(500).json(err);
      }
      res.json(rows);
    }
  );
};

exports.activate = (req, res) => {
  const { payment_id } = req.body;

  db.query(
    `SELECT p.*, pk.duration_days 
     FROM payments p
     JOIN packages pk ON pk.id=p.package_id
     WHERE p.id=?`,
    [payment_id],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      if (!rows.length) return res.status(404).json({ message: 'Payment not found' });

      const p = rows[0];
      if (p.status === 'confirmed')
        return res.status(400).json({ message: 'Already activated' });

      const token = uuid();

      // Insert token for user
      db.query(
        `INSERT INTO user_tokens (user_id, package_id, token, activated_at, expired_at)
         VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
        [p.user_id, p.package_id, token, p.duration_days],
        (err) => {
          if (err) {
            console.error('Error creating token:', err);
            return res.status(500).json({ message: 'Failed to create token' });
          }

          // Update payment status
          db.query(`UPDATE payments SET status='confirmed' WHERE id=?`, [payment_id], (err) => {
             if (err) {
                console.error('Error updating payment status:', err);
                return res.status(500).json({ message: 'Failed to update payment status' });
             }
             res.json({ message: 'Package activated', token });
          });
        }
      );
    }
  );
};
