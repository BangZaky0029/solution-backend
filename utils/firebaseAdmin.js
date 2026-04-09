const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const Logger = require('./logger');

// Load environment variables for configuration
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const databaseURL = process.env.FIREBASE_DATABASE_URL;

let db = null;

if (serviceAccountPath) {
    try {
        // Robust cleaning: remove trailing/leading whitespace and quotes
        const cleanPath = serviceAccountPath.replace(/['"]/g, '').trim();
        
        // Use fs.readFileSync instead of require() for better reliability on absolute paths in Windows
        const resolvedPath = path.isAbsolute(cleanPath) 
            ? cleanPath 
            : path.resolve(process.cwd(), cleanPath);
            
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File not found at: ${resolvedPath}`);
        }

        const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: databaseURL
        });

        db = admin.firestore(); // Using Firestore for logging
        console.log('✅ [FIREBASE] Firebase Admin initialized successfully');
    } catch (error) {
        console.error('❌ [FIREBASE] Initialization error:', error.message);
        Logger.error('FIREBASE', 'Initialization failed', error);
    }
} else {
    console.warn('⚠️ [FIREBASE] No service account path provided in .env');
}

/**
 * Log an activity to Firestore (Optional)
 * @param {string} collection - Firestore collection name (e.g., 'activity_logs')
 * @param {object} data - Data to log
 */
const logToFirestore = async (collection, data) => {
    // Gracefully skip if Firebase is not initialized or database is missing
    if (!db) return null;

    try {
        const logData = {
            ...data,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            created_at: new Date().toISOString()
        };

        const result = await db.collection(collection).add(logData);
        return result.id;
    } catch (error) {
        // Only log warning, don't throw to prevent crashing the main activity logger
        // console.warn(`⚠️ [FIREBASE] Firestore logging skipped: ${error.message}`);
        return null;
    }
};

module.exports = {
    admin,
    db,
    logToFirestore
};
