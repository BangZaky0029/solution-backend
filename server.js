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

server.listen(PORT, '0.0.0.0', async () => {
  Logger.info('SERVER', `🚀 Server running on port ${PORT}`)

  // auto init
  await whatsappClient.initialize(io)

  // auto health check
  setTimeout(async () => {
    const health = await whatsappClient.healthCheck()
    Logger.info('WHATSAPP', 'Health check result', health)

    if (!health.healthy) {
      Logger.warn('WHATSAPP', 'Health failed, restarting...')
      await whatsappClient.restart(io)
    }
  }, 5000)
})

module.exports = server
