require('dotenv').config()
const http = require('http')
const app = require('./app')
const { initSocket } = require('./socket')
const Logger = require('./utils/logger')
const whatsappClient = require('./utils/whatsappClient')

const PORT = process.env.PORT || 5000
const server = http.createServer(app)

// init socket
const io = initSocket(server)
app.set('io', io)

// routes
app.use('/whatsapp', require('./routes/whatsapp'))

server.listen(PORT, '0.0.0.0', () => {
  Logger.info('SERVER', `🚀 Server running on port ${PORT}`)

  // ⏳ delay WA init (VPS butuh waktu)
  setTimeout(async () => {
    try {
      Logger.info('WHATSAPP', 'Delayed init starting...')
      await whatsappClient.initialize(io)
    } catch (err) {
      Logger.error('WHATSAPP', 'Init failed', err)
    }
  }, 8000) // ⬅️ WAJIB
})


module.exports = server
