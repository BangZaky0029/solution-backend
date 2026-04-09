const db = require('./config/db');

async function inspectFeatures() {
  try {
    const [rows] = await db.query('DESCRIBE features');
    console.log('Features columns:', JSON.stringify(rows, null, 2));
    
    const [samples] = await db.query('SELECT * FROM features LIMIT 5');
    console.log('Features samples:', JSON.stringify(samples, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

inspectFeatures();
