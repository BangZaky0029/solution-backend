// socket.js
const { Server } = require('socket.io')
const Logger = require('./utils/logger')

let io

const initSocket = (server) => {
  if (io) return io

  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket) => {
    Logger.info('SOCKET', `Client connected: ${socket.id}`)

    socket.on('disconnect', () => {
      Logger.info('SOCKET', `Client disconnected: ${socket.id}`)
    })
  })

  return io
}

module.exports = { initSocket }
