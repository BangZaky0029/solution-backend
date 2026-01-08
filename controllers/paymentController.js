// =========================================
// FILE: paymentController.js - BACKEND FIXED
// Path: gateway_apto-backend/controllers/paymentController.js
// =========================================

const PDFDocument = require('pdfkit');
const db = require('../config/db');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');

// =========================
// Multer setup untuk bukti
// =========================
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, name);
  }
});
const upload = multer({ storage });

// =========================
// ✅ CREATE PAYMENT (user) - FIXED
// =========================
exports.create = (req, res) => {
  const { package_id, method, forceUpgrade } = req.body;
  const userId = req.user.id;

  if (!package_id || !method) {
    return res.status(400).json({ 
      success: false,
      message: 'Package ID dan metode diperlukan' 
    });
  }

  // 1. Cek paket aktif
  db.query(
    `SELECT ut.id AS token_id, ut.package_id, pk.name AS package_name
     FROM user_tokens ut
     JOIN packages pk ON pk.id = ut.package_id
     WHERE ut.user_id = ? AND ut.is_active = 1`,
    [userId],
    (err, activeTokens) => {
      if (err) {
        return res.status(500).json({ 
          success: false,
          message: 'Error checking active tokens', 
          error: err 
        });
      }

      // ✅ FIXED: Jika ada paket aktif DAN user belum confirm upgrade
      if (activeTokens.length > 0 && !forceUpgrade) {
        return res.json({
          success: false,
          hasActive: true,
          currentPackage: {
            token_id: activeTokens[0].token_id,
            package_id: activeTokens[0].package_id,
            package_name: activeTokens[0].package_name
          },
          warning: "PENTING: Jika Anda melakukan upgrade paket ini, maka paket sebelumnya akan dihapus."
        });
      }

      // ✅ Jika user setuju upgrade → hapus paket lama
      if (activeTokens.length > 0 && forceUpgrade) {
        db.query(
          'UPDATE user_tokens SET is_active=0 WHERE user_id=? AND is_active=1',
          [userId],
          (err2) => {
            if (err2) {
              return res.status(500).json({ 
                success: false,
                message: 'Error deactivating old tokens', 
                error: err2 
              });
            }
            // Continue to create payment
            createPaymentRecord();
          }
        );
      } else {
        // No active package, create payment directly
        createPaymentRecord();
      }

      // ✅ Function to create payment record
      function createPaymentRecord() {
        db.query(
          `INSERT INTO payments (user_id, package_id, payment_method, amount, status)
           SELECT ?, id, ?, price, 'pending'
           FROM packages WHERE id=?`,
          [userId, method, package_id],
          (err3, result) => {
            if (err3 || result.affectedRows === 0) {
              return res.status(400).json({ 
                success: false,
                message: 'Invalid package atau gagal membuat payment', 
                error: err3 
              });
            }

            // ✅ FIXED: Kirim success: true
            res.json({
              success: true,
              message: 'Payment berhasil dibuat, silakan upload bukti',
              payment_id: result.insertId
            });
          }
        );
      }
    }
  );
};

// =========================
// ✅ CONFIRM PAYMENT - FIXED
// =========================
exports.confirm = [
  upload.single('proof'),
  (req, res) => {
    const userId = req.user.id;
    const { payment_id, email, phone } = req.body;

    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: 'Bukti pembayaran wajib diupload' 
      });
    }

    if (!payment_id || !email || !phone) {
      return res.status(400).json({ 
        success: false,
        message: 'payment_id, email, dan phone wajib diisi' 
      });
    }

    // Validasi payment belongs to user
    db.query(
      'SELECT id FROM payments WHERE id=? AND user_id=? AND status="pending"',
      [payment_id, userId],
      (err, payments) => {
        if (err) {
          return res.status(500).json({ 
            success: false,
            message: 'Error validating payment', 
            error: err 
          });
        }

        if (payments.length === 0) {
          return res.status(404).json({ 
            success: false,
            message: 'Payment tidak ditemukan atau sudah diproses' 
          });
        }

        // Simpan confirmation
        db.query(
          `INSERT INTO payment_confirmations (payment_id, email, phone, proof_image, created_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [payment_id, email, phone, req.file.filename],
          (err2) => {
            if (err2) {
              return res.status(500).json({ 
                success: false,
                message: 'Error saving confirmation', 
                error: err2 
              });
            }

            // ✅ FIXED: Kirim success: true
            res.json({ 
              success: true,
              message: 'Bukti berhasil dikirim, menunggu approval admin' 
            });
          }
        );
      }
    );
  }
];

// =========================
// ✅ CHECK ACTIVE PACKAGE - FIXED
// =========================
exports.checkActivePackage = (req, res) => {
  const userId = req.user.id;

  db.query(
    `SELECT ut.id AS token_id, ut.package_id, pk.name AS package_name, 
            ut.activated_at, ut.expired_at
     FROM user_tokens ut
     JOIN packages pk ON pk.id = ut.package_id
     WHERE ut.user_id = ? AND ut.is_active = 1`,
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ 
          success: false,
          message: 'Error checking active package', 
          error: err 
        });
      }
      
      if (rows.length > 0) {
        // ✅ User punya paket aktif
        return res.json({
          success: true,
          hasActive: true,
          activePackage: {
            token_id: rows[0].token_id,
            package_id: rows[0].package_id,
            package_name: rows[0].package_name,
            activated_at: rows[0].activated_at,
            expired_at: rows[0].expired_at
          },
          warning: "PENTING: Jika Anda melakukan upgrade paket ini, maka paket sebelumnya akan dihapus."
        });
      } else {
        return res.json({ 
          success: true,
          hasActive: false 
        });
      }
    }
  );
};

// =========================
// GET USER PAYMENTS
// =========================
exports.getUserPayments = (req, res) => {
  const userId = req.user.id;

  db.query(
    `SELECT p.id, p.package_id, pk.name AS package_name, p.payment_method, 
            p.amount, p.status, p.created_at, p.updated_at
     FROM payments p
     JOIN packages pk ON pk.id = p.package_id
     WHERE p.user_id = ?
     ORDER BY p.created_at DESC`,
    [userId],
    (err, results) => {
      if (err) {
        return res.status(500).json({ 
          success: false,
          message: 'Error fetching payments', 
          error: err 
        });
      }
      res.json({
        success: true,
        data: results
      });
    }
  );
};

// =========================
// DOWNLOAD INVOICE (PDF)
// =========================
exports.getInvoice = (req, res) => {
  const paymentId = req.params.paymentId;
  const userId = req.user.id;

  db.query(
    `SELECT p.id, p.package_id, pk.name AS package_name, p.amount, 
            p.status, p.created_at
     FROM payments p
     JOIN packages pk ON pk.id = p.package_id
     WHERE p.id = ? AND p.user_id = ?`,
    [paymentId, userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ 
          success: false,
          message: 'Error fetching payment', 
          error: err 
        });
      }
      if (!rows.length) {
        return res.status(404).json({ 
          success: false,
          message: 'Payment not found' 
        });
      }

      const payment = rows[0];

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice-${paymentId}.pdf`);

      const doc = new PDFDocument({ margin: 50 });
      doc.pipe(res);

      const leftMargin = 80;

      // Header
      doc.image(path.join(__dirname, '..', 'invoice', 'NS_blank_02.png'), leftMargin, 20, { width: 120 });
      doc.fontSize(22).fillColor('#1f2937').text('Invoice Pembayaran', 0, 30, { align: 'right' });
      doc.moveDown(2);

      doc.moveTo(leftMargin, 120).lineTo(550, 120).strokeColor('#e5e7eb').stroke();

      // Info Payment
      doc.fontSize(12).fillColor('#374151');
      doc.text(`Invoice ID   : ${payment.id}`, leftMargin, 140);
      doc.text(`Tanggal      : ${new Date(payment.created_at).toLocaleDateString('id-ID')}`, leftMargin);
      doc.text(`Status       : ${payment.status.trim() === 'confirmed' ? '✓ Terverifikasi' : payment.status.trim()}`, leftMargin);
      doc.text(`Paket        : ${payment.package_name}`, leftMargin);
      doc.text(`Jumlah Bayar : Rp ${payment.amount.toLocaleString('id-ID')}`, leftMargin);

      doc.moveDown(1);
      doc.moveTo(leftMargin, doc.y).lineTo(550, doc.y).strokeColor('#e5e7eb').stroke();
      doc.moveDown(1);

      // Footer
      doc.fontSize(12).fillColor('#1f2937').text('Terima kasih telah menggunakan layanan kami.', {
        align: 'center'
      });
      doc.moveDown(2);

      doc.fontSize(10).fillColor('#6b7280');
      doc.text('Jika ada pertanyaan terkait pembayaran, silakan hubungi support kami.', { align: 'center' });
      doc.text('Email: cs@nuansasolution.id | Telp: 0896-4444-8721', { align: 'center' });

      doc.end();
    }
  );
};

// =========================
// ✅ ADMIN ACTIVATE - FIXED WITH VALIDATION
// =========================
exports.adminActivatePayment = (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ 
      success: false,
      message: 'Payment ID diperlukan' 
    });
  }

  // ✅ FIXED: Validasi payment status HARUS pending
  db.query(
    'UPDATE payments SET status="confirmed", updated_at=NOW() WHERE id=? AND status="pending"',
    [paymentId],
    (err, result) => {
      if (err) {
        return res.status(500).json({ 
          success: false,
          message: 'Error approving payment', 
          error: err 
        });
      }

      // ✅ FIXED: Cek apakah payment memang di-update
      if (result.affectedRows === 0) {
        return res.status(400).json({ 
          success: false,
          message: 'Payment tidak ditemukan atau sudah diproses sebelumnya' 
        });
      }

      // Ambil user_id & package_id dari payment
      db.query(
        'SELECT user_id, package_id FROM payments WHERE id=?',
        [paymentId],
        (err2, rows) => {
          if (err2 || !rows.length) {
            return res.status(500).json({ 
              success: false,
              message: 'Payment not found', 
              error: err2 
            });
          }

          const { user_id, package_id } = rows[0];

          // Nonaktifkan semua token aktif user
          db.query(
            'UPDATE user_tokens SET is_active=0 WHERE user_id=? AND is_active=1',
            [user_id],
            (err3) => {
              if (err3) {
                return res.status(500).json({ 
                  success: false,
                  message: 'Error deactivating old tokens', 
                  error: err3 
                });
              }

              // Buat token baru
              db.query(
                `INSERT INTO user_tokens 
                 (user_id, package_id, token, activated_at, expired_at, is_active, is_trial)
                 VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL (SELECT duration_days FROM packages WHERE id=?) DAY), 1, 0)`,
                [user_id, package_id, crypto.randomUUID(), package_id],
                (err4) => {
                  if (err4) {
                    return res.status(500).json({ 
                      success: false,
                      message: 'Error creating new token', 
                      error: err4 
                    });
                  }

                  // ✅ FIXED: Success response
                  res.json({ 
                    success: true,
                    message: 'Payment approved & package activated successfully' 
                  });
                }
              );
            }
          );
        }
      );
    }
  );
};

// =========================
// Export middleware upload
// =========================
exports.uploadMiddleware = upload;