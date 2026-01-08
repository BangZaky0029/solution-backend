const db = require('../config/db');

function expireTokens() {
  db.query(
    `UPDATE user_tokens
     SET is_active=0
     WHERE expired_at < NOW() AND is_active=1`,
    (err, result) => {
      if (err) return console.error('Cron Error:', err);
      if (result.affectedRows) {
        console.log(`✅ Expired ${result.affectedRows} tokens`);
      }
    }
  );
}

// Jalankan setiap 1 menit (production bisa 1 jam)
setInterval(expireTokens, 60 * 1000);
