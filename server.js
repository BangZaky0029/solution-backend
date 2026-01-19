require('dotenv').config();
const http = require('http');
const app = require('./app');

const { initSocket, getIO } = require('./socket');
const whatsappClient = require('./utils/whatsappClient');
const Logger = require('./utils/logger');

const server = http.createServer(app);

// 1️⃣ INIT SOCKET.IO
initSocket(server);

// 2️⃣ INIT WHATSAPP (SETELAH SOCKET)
if (process.env.WHATSAPP_ENABLED !== 'false') {
  setTimeout(() => {
    Logger.info('WHATSAPP', 'Initializing WhatsApp Client...');
    whatsappClient.initialize(getIO());
  }, 2000);
}

// 3️⃣ START SERVER
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  Logger.info('SERVER', `🚀 Server running on port ${PORT}`);
  Logger.info('SERVER', `🔌 Socket.IO ready`);
});
