// controllers/whatsappController.js
const wa = require('../utils/whatsappClient')

exports.init = async (req, res) => {
  try {
    const io = req.app.get('io')
    await wa.initialize(io)

    res.json({
      success: true,
      message: 'WhatsApp initializing',
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}

exports.status = (req, res) => {
  res.json({
    success: true,
    ...wa.getStatus(),
  })
}
