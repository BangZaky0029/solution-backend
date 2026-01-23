
// C:\codingVibes\nuansasolution\.mainweb\payments\solution-backend\services\whatsapp.service.js
const { getIO } = require('../socket');

let status = 'disconnected';
let qrCode = null;

const emitStatus = () => {
  getIO().emit('whatsapp-status', { status });
};

exports.getStatus = () => {
  return { status, qrCode };
};

exports.restart = async () => {
  status = 'connecting';
  emitStatus();

  // simulasi generate QR
  setTimeout(() => {
    status = 'qr';
    qrCode = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=WHATSAPP_QR';
    
    getIO().emit('whatsapp-qr', {
      status,
      qr: qrCode
    });
  }, 2000);
};

exports.disconnect = async () => {
  status = 'disconnected';
  qrCode = null;
  emitStatus();
};

exports.sendMessage = async (phone, message) => {
  console.log('📤 Send message:', phone, message);
};

exports.validateNumber = (phone) => {
  const formatted = phone.startsWith('0')
    ? '62' + phone.slice(1)
    : phone.replace('+', '');

  return {
    isValid: true,
    message: 'Number is valid',
    formattedNumber: formatted
  };
};
