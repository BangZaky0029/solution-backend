const express = require('express');
const router = express.Router();
const admin = require('../controllers/adminController');
const adminAuth = require('../middlewares/adminMiddleware');

router.post('/login', admin.login);
router.get('/payments', adminAuth, admin.payments);
router.post('/activate', adminAuth, admin.activate);

module.exports = router;
