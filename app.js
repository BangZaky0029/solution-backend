
// app.js C:\codingVibes\nuansasolution\.mainweb\payments\solution-backend\app.js

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const requestLogger = require('./middlewares/requestLogger');
require('./utils/cron');

// Routes
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const featureRoutes = require('./routes/feature');
const linkRoutes = require('./routes/link');
// const whatsappRoutes = require('./routes/whatsapp'); // <-- WhatsApp routes
const passwordRoutes = require('./routes/password');
const packageRoutes = require('./routes/package');
const userRoutes = require('./routes/user');
const statsRoutes = require('./routes/stats');
const healthRoutes = require('./routes/health');

const app = express();

// ================================
// SECURITY MIDDLEWARE
// ================================

// Helmet - Security headers
// Helmet - Security headers (configured to allow images across origins)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "frame-ancestors": ["'self'", "http://localhost:5173", "http://localhost:3000", "*"],
    },
  },
}));

// CORS - Restrict origins in production
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
    process.env.ADMIN_URL || 'https://admin.yourdomain.com',
    process.env.CLIENT_URL || 'https://yourdomain.com'
  ]
  : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc) in dev
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// Rate limiting - Global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per window
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting - Auth endpoints (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply global rate limit
app.use(globalLimiter);

// ================================
// BODY PARSERS
// ================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(requestLogger);

// ================================
// ROUTES
// ================================
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', globalLimiter, adminRoutes);
app.use('/api/password', authLimiter, passwordRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/feature', featureRoutes);
app.use('/api/link', linkRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stats', statsRoutes);
// app.use('/api/whatsapp', whatsappRoutes); // <-- WhatsApp route
app.use('/health', healthRoutes);

// ================================
// ROOT
// ================================
app.get('/', (req, res) => {
  res.json({
    message: 'Gateway APTO API Running 🚀',
    version: '3.1',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// ================================
// 404 HANDLER
// ================================
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found'
  });
});

// ================================
// GLOBAL ERROR HANDLER
// ================================
app.use((err, req, res, next) => {
  // Handle CORS errors
  if (err.message === 'CORS not allowed') {
    return res.status(403).json({
      status: 'error',
      message: 'CORS not allowed from this origin'
    });
  }

  console.error(err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    // Only show error details in development
    ...(process.env.NODE_ENV !== 'production' && { error: err.message })
  });
});

module.exports = app;
