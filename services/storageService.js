// =========================================
// FILE: services/storageService.js (New)
// Abstracted Storage Layer for Scalability
// =========================================

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

class StorageService {
    constructor() {
        this.provider = process.env.STORAGE_PROVIDER || 'local'; // 'local', 's3', 'cloudinary'
    }

    /**
     * Get Multer Storage Engine
     */
    getStorageEngine() {
        if (this.provider === 'local') {
            return this._getLocalStorage();
        }

        // Future expansion:
        // if (this.provider === 's3') return this._getS3Storage();

        // Default to local
        return this._getLocalStorage();
    }

    /**
     * Local Storage Implementation
     */
    _getLocalStorage() {
        // Ensure upload directory exists
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        return multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, uploadDir);
            },
            filename: (req, file, cb) => {
                const ext = path.extname(file.originalname);
                const name = crypto.randomBytes(16).toString('hex') + ext;
                cb(null, name);
            }
        });
    }

    /**
     * Get public URL for a file
     */
    getFileUrl(filename) {
        if (this.provider === 'local') {
            return `${process.env.API_BASE_URL || 'http://localhost:5000'}/uploads/${filename}`;
        }
        // Future: S3 URL
        return filename;
    }
}

module.exports = new StorageService();
