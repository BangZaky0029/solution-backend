const axios = require('axios');

async function testLockdown() {
  const baseUrl = 'http://localhost:5000/api'; // Adjust if local port is different
  
  console.log('--- TESTING REGISTRATION LOCKDOWN ---');
  
  try {
    const response = await axios.post(`${baseUrl}/auth/register`, {
      name: 'Bot Tester',
      email: 'bot@tester.com',
      phone: '628123456789',
      password: 'password123'
    });
    console.log('❌ FAIL: Registration still active!', response.data);
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.log('✅ PASS: Registration correctly blocked with 403.');
      console.log('Error Message:', error.response.data.message);
    } else {
      console.log('⚠️ UNEXPECTED ERROR:', error.message);
      if (error.response) console.log('Status:', error.response.status);
    }
  }
}

testLockdown();
