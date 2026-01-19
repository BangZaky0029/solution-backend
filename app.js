  // app.js
  require('dotenv').config();

  const express = require('express');
  const cors = require('cors');
  const path = require('path');

  const requestLogger = require('./middlewares/requestLogger');
  require('./utils/cron');

  // Routes
  const authRoutes = require('./routes/auth');
  const paymentRoutes = require('./routes/payment');
  const adminRoutes = require('./routes/admin');
  const featureRoutes = require('./routes/feature');
  const linkRoutes = require('./routes/link');
  const whatsappRoutes = require('./routes/whatsapp');
  const passwordRoutes = require('./routes/password');
  const packageRoutes = require('./routes/package');
  const userRoutes = require('./routes/user');
  const statsRoutes = require('./routes/stats');
  const healthRoutes = require('./routes/health');

  const app = express();

  // ================================
  // MIDDLEWARE
  // ================================
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  app.use(requestLogger);

  // ================================
  // ROUTES
  // ================================
  app.use('/api/auth', authRoutes);
  app.use('/api/password', passwordRoutes);
  app.use('/api/payment', paymentRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/feature', featureRoutes);
  app.use('/api/link', linkRoutes);
  app.use('/api/packages', packageRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/health', healthRoutes);

  // ================================
  // ROOT
  // ================================
  app.get('/', (req, res) => {
    res.json({
      message: 'Gateway APTO API Running 🚀',
      version: '3.0',
      timestamp: new Date().toISOString()
    });
  });

  module.exports = app;
