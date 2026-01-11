// C:\codingVibes\nuansasolution\.mainweb\payments\solution-backend\server.js

require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./socket'); // 🔥 TAMBAH INI

const server = http.createServer(app);

// 🔥 INIT SOCKET.IO
initSocket(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('🔌 Socket.IO initialized');
});
