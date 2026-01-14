// =========================================
// FILE: app.js
// Gateway APTO Backend - API v3.0 (FIXED)
// =========================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const healthRoutes = require('./routes/health');

// Utilities
const Logger = require('./utils/logger');
const requestLogger = require('./middlewares/requestLogger');
require('./utils/cron');
const whatsappClient = require('./utils/whatsappClient');

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

// ===== INIT APP =====
const app = express();
const server = http.createServer(app);

// ===== SOCKET.IO (SATU KALI SAJA) =====
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.set('io', io);

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(requestLogger);

// ===== SOCKET CONNECTION =====
io.on('connection', (socket) => {
  Logger.info('SOCKET', `Client connected: ${socket.id}`);

  const status = whatsappClient.getStatus();
  socket.emit('whatsapp-status', status);

  socket.on('request-qr', () => {
    const status = whatsappClient.getStatus();
    socket.emit('whatsapp-qr', {
      qr: status.qrCode,
      status: status.status
    });
  });

  socket.on('disconnect', () => {
    Logger.info('SOCKET', `Client disconnected: ${socket.id}`);
  });
});

// ===== INITIALIZE WHATSAPP =====
// ===== INITIALIZE WHATSAPP (PRO SAFE) =====
if (process.env.WHATSAPP_ENABLED !== 'false') {
  setTimeout(() => {
    Logger.info('WHATSAPP', 'Initializing WhatsApp Client...');
    whatsappClient.initialize(io);
  }, 2000);
} else {
  Logger.info('WHATSAPP', 'WhatsApp disabled via ENV');
}


// ===== API ROUTES =====
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

// ===== ROOT =====
app.get('/', (req, res) => {
  res.json({
    message: 'Gateway APTO API Running 🚀',
    version: '3.0', 
    whatsapp: whatsappClient.isReady ? 'Connected' : 'Disconnected'
  });
});

// ===== ERROR HANDLER =====
app.use((err, req, res, next) => {
  Logger.error('EXPRESS', 'Unhandled error', err);

  res.status(500).json({
    success: false,
    message: 'Terjadi kesalahan server',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  Logger.info('SERVER', `🚀 Server running on port ${PORT}`);
  Logger.info('SERVER', `🔌 Socket.IO active`);
});

// ===== GRACEFUL SHUTDOWN =====
const shutdown = async () => {
  Logger.info('SERVER', 'Shutting down...');
  await whatsappClient.disconnect();
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
