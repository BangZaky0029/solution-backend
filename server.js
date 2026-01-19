// server.js
require('dotenv').config();
const http = require('http');
const app = require('./app');

const { initSocket, getIO } = require('./socket');
const whatsappClient = require('./utils/whatsappClient');
const Logger = require('./utils/logger');

// ================================
// CREATE HTTP SERVER
// ================================
const server = http.createServer(app);

// ================================
// INIT SOCKET.IO
// ================================
initSocket(server);

// ================================
// INIT WHATSAPP (AFTER SOCKET READY)
// ================================
if (process.env.WHATSAPP_ENABLED !== 'false') {
  setTimeout(() => {
    try {
      Logger.info('WHATSAPP', 'Initializing WhatsApp Client...');
      whatsappClient.initialize(getIO());
    } catch (err) {
      Logger.error('WHATSAPP', 'Failed to init WhatsApp', err);
    }
  }, 2000);
}

// ================================
// START SERVER
// ================================
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  Logger.info('SERVER', `🚀 Server running on port ${PORT}`);
  Logger.info('SERVER', `🔌 Socket.IO initialized`);
});
