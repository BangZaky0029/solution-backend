const express = require('express');
const router = express.Router();
const financeController = require('../controllers/adminFinanceController');
const adminAuth = require('../middlewares/adminMiddleware');

// All finance routes require admin authentication
router.use(adminAuth);

router.get('/summary', financeController.getFinanceSummary);
router.get('/breakdown', financeController.getRevenueBreakdown);
router.get('/trends', financeController.getRevenueTrends);
router.get('/logs', financeController.getFinanceLogs);

module.exports = router;
