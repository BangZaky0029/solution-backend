// =========================================
// FILE: app.js - FIXED VERSION
// Gateway APTO Backend - API v3.0
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

// ===== SOCKET.IO CONFIGURATION =====
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

app.set('io', io);

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(requestLogger);

// ===== SOCKET CONNECTION HANDLER =====
io.on('connection', (socket) => {
  Logger.info('SOCKET', `Client connected: ${socket.id}`);

  try {
    // Send initial status - SAFE METHOD CALL
    const status = whatsappClient.getStatus();
    socket.emit('whatsapp-status', {
      status: status.status,
      isReady: status.isReady,
      qr: status.qrCode,
      info: status.info
    });

    // Handle QR request
    socket.on('request-qr', () => {
      try {
        const status = whatsappClient.getStatus();
        socket.emit('whatsapp-qr', {
          qr: status.qrCode,
          status: status.status
        });
      } catch (error) {
        Logger.error('SOCKET', 'Error sending QR', error);
        socket.emit('whatsapp-error', {
          message: 'Failed to get QR code'
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      Logger.info('SOCKET', `Client disconnected: ${socket.id}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      Logger.error('SOCKET', 'Socket error', error);
    });

  } catch (error) {
    Logger.error('SOCKET', 'Connection handler error', error);
    socket.emit('whatsapp-error', {
      message: 'Failed to initialize connection'
    });
  }
});

// ===== INITIALIZE WHATSAPP =====
if (process.env.WHATSAPP_ENABLED !== 'false') {
  setTimeout(() => {
    Logger.info('WHATSAPP', 'Initializing WhatsApp Client...');
    
    whatsappClient.initialize(io).catch(error => {
      Logger.error('WHATSAPP', 'Failed to initialize', error);
    });
  }, 3000); // 3 second delay for stability
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

// ===== ROOT ENDPOINT =====
app.get('/', (req, res) => {
  const status = whatsappClient.getStatus();
  
  res.json({
    message: 'Gateway APTO API Running 🚀',
    version: '3.0',
    timestamp: new Date().toISOString(),
    whatsapp: {
      status: status.status,
      isReady: status.isReady
    }
  });
});

// ===== 404 HANDLER =====
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path
  });
});

// ===== ERROR HANDLER =====
app.use((err, req, res, next) => {
  Logger.error('EXPRESS', 'Unhandled error', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Terjadi kesalahan server',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  Logger.info('SERVER', `🚀 Server running on port ${PORT}`);
  Logger.info('SERVER', `🔌 Socket.IO active`);
  Logger.info('SERVER', `📱 WhatsApp: ${process.env.WHATSAPP_ENABLED !== 'false' ? 'Enabled' : 'Disabled'}`);
});

// ===== GRACEFUL SHUTDOWN =====
const shutdown = async (signal) => {
  Logger.info('SERVER', `Received ${signal}, shutting down gracefully...`);
  
  try {
    // Close Socket.IO connections
    io.close(() => {
      Logger.info('SOCKET', 'All connections closed');
    });
    
    // Disconnect WhatsApp
    await whatsappClient.disconnect();
    
    // Close server
    server.close(() => {
      Logger.info('SERVER', 'Server closed');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      Logger.error('SERVER', 'Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    Logger.error('SERVER', 'Error during shutdown', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  Logger.error('PROCESS', 'Uncaught Exception', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('PROCESS', 'Unhandled Rejection', { reason, promise });
});

module.exports = app;