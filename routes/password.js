// =========================================
// FILE: routes/password.js - NEW
// Password Reset Routes
// =========================================

const express = require('express');
const router = express.Router();
const passwordController = require('../controllers/passwordController');

// Request password reset (send OTP)
router.post('/forgot', passwordController.forgotPassword);

// Verify reset OTP
router.post('/verify-reset-otp', passwordController.verifyResetOTP);

// Reset password
router.post('/reset', passwordController.resetPassword);

// Resend reset OTP
router.post('/resend-otp', passwordController.resendResetOTP);

module.exports = router;