const express = require('express');
const router = express.Router();
const linkProtec = require('../controllers/linkProtec');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/check', authMiddleware, linkProtec.checkLinkAccess);

module.exports = router;
