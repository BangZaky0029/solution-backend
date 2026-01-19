require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./socket');
const whatsappClient = require('./utils/whatsappClient');
const Logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

// ================================
// CREATE HTTP SERVER
// ================================
const server = http.createServer(app);

// ================================
// INIT SOCKET.IO
// ================================
const io = initSocket(server); // dapat instance io
Logger.info('SERVER', '🔌 Socket.IO initialized');

// ================================
// START SERVER
// ================================
server.listen(PORT, '0.0.0.0', async () => {
  Logger.info('SERVER', `🚀 Server running on port ${PORT}`);

  // ================================
  // INIT WHATSAPP CLIENT (SAFE)
  // ================================
  if (process.env.WHATSAPP_ENABLED !== 'false') {
    try {
      Logger.info('WHATSAPP', 'Initializing WhatsApp Client...');
      await whatsappClient.initialize(io); // inject io ke WA client
      Logger.info('WHATSAPP', 'WhatsApp Client initialized successfully');
    } catch (err) {
      Logger.error('WHATSAPP', 'Failed to init WhatsApp Client', err);
    }
  }
});

// ================================
// HANDLE UNCAUGHT ERRORS
// ================================
process.on('uncaughtException', (err) => {
  Logger.error('SERVER', 'Uncaught Exception', err);
});
process.on('unhandledRejection', (err) => {
  Logger.error('SERVER', 'Unhandled Rejection', err);
});

module.exports = server;
