const db = require('./config/db');
const email = 'haryantoumaya4727@gmail.com';

async function check() {
  try {
    const [users] = await db.query('SELECT id, name, email FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      console.log('User not found');
      process.exit(0);
    }
    const user = users[0];
    console.log('User Found:', user);

    const [tokens] = await db.query('SELECT * FROM user_tokens WHERE user_id = ? AND is_trial = 1', [user.id]);
    console.log('Trial Tokens:', JSON.stringify(tokens, null, 2));
    
    // Check if user is in deleted_users_history too (to see if they were denied)
    const [history] = await db.query(
      'SELECT * FROM deleted_users_history WHERE (phone = ? OR email = ?)',
      [user.phone, user.email]
    );
    console.log('Deleted History:', JSON.stringify(history, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
