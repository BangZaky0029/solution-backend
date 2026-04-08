// =========================================
// FILE: controllers/accessController.js
// Access Check Controller - Check User Subscription
// =========================================

const db = require('../config/db');
const Logger = require('../utils/logger');

/**
 * CHECK ACCESS - Public Endpoint (No Auth Required)
 * POST /api/access/check
 *
 * Request Body:
 * {
 *   "phone": "628xxxx",
 *   "feature_slug": "akuntansi"
 * }
 *
 * Response:
 * { "status": true/false, "message": "..." }
 */
exports.checkAccess = async (req, res) => {
    try {
        const { phone, identifier, feature_slug } = req.body;
        const targetIdentifier = identifier || phone;

        // Input validation
        if (!targetIdentifier || !feature_slug) {
            return res.status(400).json({
                status: false,
                message: 'Phone/Email dan feature_slug wajib diisi'
            });
        }

        let userId = null;
        const isEmail = targetIdentifier.includes('@');
        const isPhone = /^\+?[0-9\s-]+$/.test(targetIdentifier) && targetIdentifier.replace(/\D/g, '').length >= 7;

        if (isEmail) {
            // Find user by email
            const [users] = await db.query(
                'SELECT id FROM users WHERE email = ? LIMIT 1',
                [targetIdentifier.trim().toLowerCase()]
            );
            if (users.length > 0) userId = users[0].id;
        } else if (isPhone) {
            // Normalize and find by phone
            let normalizedPhone = targetIdentifier.replace(/\D/g, '');
            if (normalizedPhone.startsWith('0')) {
                normalizedPhone = '62' + normalizedPhone.slice(1);
            } else if (!normalizedPhone.startsWith('62') && normalizedPhone.length > 0) {
                normalizedPhone = '62' + normalizedPhone;
            }
            const [users] = await db.query(
                'SELECT id FROM users WHERE phone = ? LIMIT 1',
                [normalizedPhone]
            );
            if (users.length > 0) userId = users[0].id;
        } else {
            // Find by name (exact match or similar)
            const [users] = await db.query(
                'SELECT id FROM users WHERE name = ? LIMIT 1',
                [targetIdentifier.trim()]
            );
            if (users.length > 0) userId = users[0].id;
        }

        if (!userId) {
            Logger.info('ACCESS', `User not found for identifier: ${targetIdentifier}`);
            return res.json({
                status: false,
                message: 'Data tidak ditemukan. Pastikan WhatsApp/Email/Nama sudah benar.'
            });
        }

        Logger.info('ACCESS', `Check access: user_id=${userId}, feature=${feature_slug}`);

        // 2. Find feature by slug
        const [features] = await db.query(
            'SELECT id, status FROM features WHERE slug = ? LIMIT 1',
            [feature_slug]
        );

        if (features.length === 0) {
            Logger.info('ACCESS', `Feature not found: ${feature_slug}`);
            return res.json({
                status: false,
                message: 'Feature tidak ditemukan'
            });
        }

        const feature = features[0];

        // 3. If feature is FREE, always grant access
        if (feature.status === 'free') {
            Logger.info('ACCESS', `Free feature access granted: ${feature_slug}`);
            return res.json({
                status: true,
                message: 'Access granted (free feature)'
            });
        }

        // 4. Check access in both user_subscriptions OR user_tokens (for trials/packages)
        const [accessRecords] = await db.query(
            `
            SELECT id, expired_at FROM (
                -- Check direct subscriptions
                SELECT id, expired_at 
                FROM user_subscriptions 
                WHERE user_id = ? AND feature_id = ? AND is_active = 1 AND expired_at > NOW()
                
                UNION ALL
                
                -- Check via user_tokens (important for Trials and holistic packages)
                SELECT ut.id, ut.expired_at
                FROM user_tokens ut
                JOIN package_features pf ON pf.package_id = ut.package_id
                WHERE ut.user_id = ? AND pf.feature_id = ? AND ut.is_active = 1 AND ut.expired_at > NOW()
            ) AS combined_access
            LIMIT 1
            `,
            [userId, feature.id, userId, feature.id]
        );

        if (accessRecords.length > 0) {
            const expiredAt = new Date(accessRecords[0].expired_at);
            Logger.info('ACCESS', `Access granted: user=${userId}, feature=${feature_slug}, expires=${expiredAt}`);

            return res.json({
                status: true,
                message: 'Access granted',
                expired_at: accessRecords[0].expired_at
            });
        }

        // 5. No active subscription found
        Logger.info('ACCESS', `Access denied: user=${userId}, feature=${feature_slug}`);
        return res.json({
            status: false,
            message: 'Subscription paket Anda belum aktif atau sudah kedaluwarsa.'
        });

    } catch (error) {
        Logger.error('ACCESS', 'Check access error', error);
        res.status(500).json({
            status: false,
            message: 'Terjadi kesalahan server'
        });
    }
};

/**
 * CHECK MULTIPLE FEATURES - Public Endpoint
 * POST /api/access/check-multiple
 *
 * Request Body:
 * {
 *   "phone": "628xxxx",
 *   "feature_slugs": ["akuntansi", "invoice", "slip-gaji"]
 * }
 */
exports.checkMultipleAccess = async (req, res) => {
    try {
        const { phone, identifier, feature_slugs } = req.body;
        const targetIdentifier = identifier || phone;

        if (!targetIdentifier || !feature_slugs || !Array.isArray(feature_slugs)) {
            return res.status(400).json({
                status: false,
                message: 'Phone/Email dan feature_slugs (array) wajib diisi'
            });
        }

        let userId = null;
        const isEmail = targetIdentifier.includes('@');
        const isPhone = /^\+?[0-9\s-]+$/.test(targetIdentifier) && targetIdentifier.replace(/\D/g, '').length >= 7;

        if (isEmail) {
            // Find user by email
            const [users] = await db.query(
                'SELECT id FROM users WHERE email = ? LIMIT 1',
                [targetIdentifier.trim().toLowerCase()]
            );
            if (users.length > 0) userId = users[0].id;
        } else if (isPhone) {
            // Normalize and find by phone
            let normalizedPhone = targetIdentifier.replace(/\D/g, '');
            if (normalizedPhone.startsWith('0')) {
                normalizedPhone = '62' + normalizedPhone.slice(1);
            } else if (!normalizedPhone.startsWith('62') && normalizedPhone.length > 0) {
                normalizedPhone = '62' + normalizedPhone;
            }
            const [users] = await db.query(
                'SELECT id FROM users WHERE phone = ? LIMIT 1',
                [normalizedPhone]
            );
            if (users.length > 0) userId = users[0].id;
        } else {
            // Find by name
            const [users] = await db.query(
                'SELECT id FROM users WHERE name = ? LIMIT 1',
                [targetIdentifier.trim()]
            );
            if (users.length > 0) userId = users[0].id;
        }

        if (!userId) {
            return res.json({
                status: false,
                message: 'User tidak ditemukan',
                access: {}
            });
        }

        // Get all requested features
        const [features] = await db.query(
            'SELECT id, slug, status FROM features WHERE slug IN (?)',
            [feature_slugs]
        );

        // Get user's active feature IDs from both tables
        const [subscriptions] = await db.query(
            `
            SELECT feature_id FROM (
                -- From direct subscriptions
                SELECT feature_id 
                FROM user_subscriptions 
                WHERE user_id = ? AND is_active = 1 AND expired_at > NOW()
                
                UNION
                
                -- From user_tokens (Trials and packages)
                SELECT pf.feature_id
                FROM user_tokens ut
                JOIN package_features pf ON pf.package_id = ut.package_id
                WHERE ut.user_id = ? AND ut.is_active = 1 AND ut.expired_at > NOW()
            ) AS combined_features
            `,
            [userId, userId]
        );

        const activeFeatureIds = new Set(subscriptions.map(s => s.feature_id));

        // Build access map
        const access = {};
        for (const feature of features) {
            if (feature.status === 'free') {
                access[feature.slug] = true;
            } else {
                access[feature.slug] = activeFeatureIds.has(feature.id);
            }
        }

        // Mark missing features as false
        for (const slug of feature_slugs) {
            if (!(slug in access)) {
                access[slug] = false;
            }
        }

        res.json({
            status: true,
            access
        });

    } catch (error) {
        Logger.error('ACCESS', 'Check multiple access error', error);
        res.status(500).json({
            status: false,
            message: 'Terjadi kesalahan server'
        });
    }
};