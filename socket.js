// socket.js
const { Server } = require('socket.io');
const Logger = require('./utils/logger');
const whatsappClient = require('./utils/whatsappClient'); // instance singleton

let io;

io.on('connection', (socket) => {
  Logger.info('SOCKET', `Client connected: ${socket.id}`);

  // Kirim status WhatsApp saat baru connect
  const status = whatsappClient.getStatus();
  socket.emit('whatsapp-status', status);

  // Request QR manual
  socket.on('request-qr', () => {
    const status = whatsappClient.getStatus();
    socket.emit('whatsapp-status', status);
  });

  socket.on('disconnect', () => {
    Logger.info('SOCKET', `Client disconnected: ${socket.id}`);
  });
});


/**
 * Initialize Socket.IO server
 * @param {http.Server} server - HTTP server
 * @returns {Server} io instance
 */
const initSocket = (server) => {
  if (io) return io; // prevent multiple initialization

  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    Logger.info('SOCKET', `Client connected: ${socket.id}`);

    // Handle QR code / status request from frontend
    socket.on('request-qr', async () => {
      try {
        if (!whatsappClient) {
          Logger.warn('SOCKET', 'WhatsApp client not ready');
          socket.emit('whatsapp-status', { status: 'not_ready', isReady: false });
          return;
        }

        const status = whatsappClient.getStatus();

        // Kirim status + QR sekaligus
        socket.emit('whatsapp-status', {
          status: status.status,
          isReady: status.isReady,
          qr: status.qrCode || null
        });

      } catch (err) {
        Logger.error('SOCKET', 'Failed to get WhatsApp status', err);
        socket.emit('whatsapp-status', { status: 'error', isReady: false });
      }
    });

    socket.on('disconnect', () => {
      Logger.info('SOCKET', `Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Get initialized io instance
 * @returns {Server}
 */
const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

module.exports = { initSocket, getIO };
