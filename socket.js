// socket.js
const { Server } = require('socket.io');
const Logger = require('./utils/logger');
const whatsappClient = require('./utils/whatsappClient'); // instance singleton

let io;
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

    // Kirim status WA saat baru connect
    const status = whatsappClient.getStatus();
    socket.emit('whatsapp-status', {
      status: status.status,
      isReady: status.isReady,
      qr: status.qrCode || null,
      info: status.info || null
    });

    // request QR manual
    socket.on('request-qr', () => {
      const status = whatsappClient.getStatus();
      socket.emit('whatsapp-status', {
        status: status.status,
        isReady: status.isReady,
        qr: status.qrCode || null,
        info: status.info || null
      });
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
