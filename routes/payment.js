// =========================================
// FILE: payment.js - BACKEND ROUTES FIXED
// Path: gateway_apto-backend/routes/payment.js
// =========================================

const express = require('express');
const router = express.Router();
const payment = require('../controllers/paymentController');
const auth = require('../middlewares/authMiddleware');

// =========================
// USER ROUTES
// =========================

// ✅ CREATE PAYMENT
router.post('/create', auth, payment.create);

// ✅ FIXED: Endpoint sesuai dengan frontend
// Frontend: api.get('/payment/check-active-package')
router.get('/check-active-package', auth, payment.checkActivePackage);

// ✅ CONFIRM PAYMENT (upload bukti)
router.post('/confirm', auth, payment.confirm);

// ✅ GET USER PAYMENTS
router.get('/user/payments', auth, payment.getUserPayments);

// ✅ DOWNLOAD INVOICE
router.get('/:paymentId/invoice', auth, payment.getInvoice);

// =========================
// ADMIN ROUTES
// =========================

// ✅ ADMIN APPROVE PAYMENT
router.post('/admin/activate', auth, payment.adminActivatePayment);

// ✅ Export router
module.exports = router;