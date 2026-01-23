// =========================================
// FILE: server.js - FIXED
// =========================================

require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./socket');
const whatsappClient = require('./utils/whatsappClient');
const Logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// ✅ Initialize Socket.IO
const io = initSocket(server);
Logger.info('SERVER', '🔌 Socket.IO initialized');

// ✅✅✅ CRITICAL: Store io in app for route access
app.set('io', io);
Logger.info('SERVER', '✅ Socket.IO stored in app');

server.listen(PORT, '0.0.0.0', async () => {
  Logger.info('SERVER', `🚀 Server running on port ${PORT}`);

  if (process.env.WHATSAPP_ENABLED !== 'false') {
    try {
      Logger.info('WHATSAPP', 'Initializing WhatsApp...');
      await whatsappClient.initialize(io);
      Logger.info('WHATSAPP', '✅ WhatsApp initialized');
    } catch (err) {
      Logger.error('WHATSAPP', 'Init failed', err);
    }
  }
});

process.on('uncaughtException', (err) => Logger.error('SERVER', 'Uncaught Exception', err));
process.on('unhandledRejection', (err) => Logger.error('SERVER', 'Unhandled Rejection', err));

module.exports = server;