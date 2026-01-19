// server.js
require('dotenv').config();
const http = require('http');

const app = require('./app');
const { initSocket, getIO } = require('./socket');
const whatsappClient = require('./utils/whatsappClient');
const Logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

// ================================
// CREATE HTTP SERVER
// ================================
const server = http.createServer(app);

// ================================
// INIT SOCKET.IO (WAJIB SEBELUM LISTEN)
// ================================
initSocket(server);

// ================================
// START SERVER (INI KUNCI UTAMA)
// ================================
server.listen(PORT, '0.0.0.0', () => {
  Logger.info('SERVER', `🚀 Server running on port ${PORT}`);
  Logger.info('SERVER', `🔌 Socket.IO ready`);
});

// ================================
// INIT WHATSAPP (SETELAH SERVER & SOCKET)
// ================================
if (process.env.WHATSAPP_ENABLED !== 'false') {
  // setTimeout(() => {
  //   try {
  //     Logger.info('WHATSAPP', 'Initializing WhatsApp Client...');
  //     whatsappClient.initialize(getIO());
  //   } catch (err) {
  //     Logger.error('WHATSAPP', 'Failed to init WhatsApp', err);
  //   }
  // }, 3000);
}
