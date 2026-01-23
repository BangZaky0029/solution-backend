// C:\codingVibes\nuansasolution\.mainweb\payments\solution-backend\utils\otp.js

exports.generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();
