// =========================================
// FILE: app.js
// Gateway APTO Backend - API v2.1
// Auto Trial + Feature Access + WhatsApp Bot
// =========================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

// =======================
// ROUTES
// =======================
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const featureRoutes = require('./routes/feature');
const linkRoutes = require('./routes/link');
const whatsappRoutes = require('./routes/whatsapp'); // 🆕 WhatsApp routes

// Dashboard / Management
const packageRoutes = require('./routes/package');
const userRoutes = require('./routes/user');
const statsRoutes = require('./routes/stats');

// =======================
// UTILS
// =======================
require('./utils/cron'); // Cron job untuk expire token otomatis
const whatsappClient = require('./utils/whatsappClient'); // 🆕 WhatsApp client

// =======================
// APP INIT
// =======================
const app = express();
const server = http.createServer(app);

// Socket.IO setup with CORS
const io = new Server(server, {
  cors: {
    origin: '*', // In production, specify your frontend URL
    methods: ['GET', 'POST']
  }
});

// Store io instance in app for access in routes
app.set('io', io);

// =======================
// MIDDLEWARE
// =======================
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =======================
// SOCKET.IO CONNECTION
// =======================
io.on('connection', (socket) => {
  console.log('👤 Admin client connected:', socket.id);

  // Send current WhatsApp status to newly connected client
  const status = whatsappClient.getStatus();
  socket.emit('whatsapp-status', status);

  socket.on('disconnect', () => {
    console.log('👋 Admin client disconnected:', socket.id);
  });

  // Admin can request QR refresh
  socket.on('request-qr', () => {
    const status = whatsappClient.getStatus();
    socket.emit('whatsapp-qr', {
      qr: status.qrCode,
      status: status.status
    });
  });
});

// =======================
// INITIALIZE WHATSAPP
// =======================
// Initialize WhatsApp client on startup
setTimeout(() => {
  console.log('🚀 Initializing WhatsApp Client...');
  whatsappClient.initialize(io);
}, 2000); // Small delay to ensure everything is loaded

// =======================
// API ROUTES
// =======================
// Auth & OTP
app.use('/api/auth', authRoutes);

// Payment & confirmation
app.use('/api/payment', paymentRoutes);

// Admin panel
app.use('/api/admin', adminRoutes);

// Feature access (trial / package)
app.use('/api/feature', featureRoutes);

// Links (misc)
app.use('/api/link', linkRoutes);

// Dashboard / management routes
app.use('/api/packages', packageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stats', statsRoutes);

// 🆕 WhatsApp bot routes
app.use('/api/whatsapp', whatsappRoutes);

// =======================
// ROOT ENDPOINT
// =======================
app.get('/', (req, res) => {
  res.json({
    message: 'Gateway APTO API Running 🚀',
    version: '2.1',
    features: {
      whatsappBot: whatsappClient.isReady ? '✅ Connected' : '❌ Disconnected'
    },
    endpoints: {
      auth: '/api/auth',
      payment: '/api/payment',
      admin: '/api/admin',
      packages: '/api/packages',
      users: '/api/users',
      stats: '/api/stats',
      feature: '/api/feature',
      link: '/api/link',
      whatsapp: '/api/whatsapp'
    }
  });
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📊 Dashboard API endpoints ready`);
  console.log(`💬 WhatsApp Bot initializing...`);
  console.log(`🔌 Socket.IO ready for real-time updates`);
});