// ==========================================
// controllers/adminUserController.js
// ==========================================
const db = require('../config/db');

/**
 * GET ALL USERS (ADMIN) 
 * Includes recent login stats and active packages
 */
exports.getAllUsers = async (req, res) => {
  try {
    const query = `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.phone, 
        u.is_verified, 
        u.created_at, 
        u.last_login_at, 
        u.login_count,

        (SELECT p.name FROM user_tokens ut 
         JOIN packages p ON p.id = ut.package_id 
         WHERE ut.user_id = u.id AND ut.is_active = 1 AND ut.expired_at > NOW() 
         ORDER BY ut.expired_at DESC LIMIT 1) as package_name,

        (SELECT ut.expired_at FROM user_tokens ut 
         WHERE ut.user_id = u.id AND ut.is_active = 1 AND ut.expired_at > NOW() 
         ORDER BY ut.expired_at DESC LIMIT 1) as expired_at,

        CASE 
          WHEN EXISTS (SELECT 1 FROM user_tokens ut WHERE ut.user_id = u.id AND ut.is_active = 1 AND ut.expired_at > NOW()) 
          THEN 1 ELSE 0 
        END as is_active

      FROM users u
      ORDER BY u.created_at DESC
    `;

    const [rows] = await db.query(query);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error('[ADMIN_USER_ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error: ' + error.message
    });
  }
};

/**
 * GET SINGLE USER DETAILS (ADMIN)
 */
exports.getUserDetail = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get basic user info
    const [users] = await db.query(`
      SELECT id, name, email, phone, is_verified, created_at, last_login_at, login_count 
      FROM users WHERE id = ?
    `, [id]);

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];

    // 2. Get active tokens/packages
    const [tokens] = await db.query(`
      SELECT ut.id, p.name as package_name, ut.activated_at, ut.expired_at, ut.is_active
      FROM user_tokens ut
      JOIN packages p ON ut.package_id = p.id
      WHERE ut.user_id = ?
      ORDER BY ut.expired_at DESC
    `, [id]);

    // 3. Get payment history
    const [payments] = await db.query(`
      SELECT p.id, pa.name as package_name, p.amount, p.status, p.created_at
      FROM payments p
      JOIN packages pa ON p.package_id = pa.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `, [id]);

    res.json({
      success: true,
      data: {
        ...user,
        tokens,
        payments
      }
    });

  } catch (error) {
    console.error('[ADMIN_DETAIL_ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error: ' + error.message
    });
  }
};
