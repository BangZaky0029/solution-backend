// =========================================
// routes/surveys.js
// Routes for User Acquisition & Feedback
// =========================================

const express = require('express');
const router = express.Router();
const surveyController = require('../controllers/surveyController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// User Endpoints
router.get('/status', authMiddleware, surveyController.getSurveyStatus);
router.post('/acquisition', authMiddleware, surveyController.submitAcquisition);
router.post('/feedback', authMiddleware, surveyController.submitFeedback);

// Admin Endpoints
router.get('/admin/stats/acquisition', adminMiddleware, surveyController.getAcquisitionStats);
router.get('/admin/stats/feedback', adminMiddleware, surveyController.getFeedbackList);
router.post('/admin/reply/:id', adminMiddleware, surveyController.submitReply);
router.delete('/admin/reply/:id', adminMiddleware, surveyController.deleteReply);
router.patch('/admin/feedback/:id/hide', adminMiddleware, surveyController.toggleHideFeedback);
router.get('/admin/otps', adminMiddleware, surveyController.getOTPList);



// Public Endpoints (No Auth)
router.get('/public/list', surveyController.getPublicFeedbacks);


module.exports = router;
