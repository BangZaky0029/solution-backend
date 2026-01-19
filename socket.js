// C:\codingVibes\nuansasolution\.mainweb\payments\solution-backend\socket.js
const { Server } = require('socket.io');
const whatsappClient = require('./utils/whatsappClient');
const Logger = require('./utils/logger');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    Logger.info('SOCKET', `Client connected: ${socket.id}`);

    socket.on('request-qr', () => {
      const status = whatsappClient.getStatus();

      socket.emit('whatsapp-status', {
        status: status.status,
        isReady: status.isReady
      });

      if (status.qrCode) {
        socket.emit('whatsapp-qr', {
          status: status.status,
          qr: status.qrCode
        });
      }
    });

    socket.on('disconnect', () => {
      Logger.info('SOCKET', `Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

module.exports = { initSocket, getIO };
