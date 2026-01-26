// =========================================
// FILE: C:\codingVibes\nuansasolution\.mainweb\payments\solution-backend\routes\auth.js
// =========================================

const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');

router.post('/register', auth.register);
router.post('/verify-otp', auth.verifyOtp);
router.post('/resend-otp', auth.resendOtp); // 🆕 Resend OTP
router.post('/login', auth.login);
router.get('/me', auth.me);

module.exports = router;