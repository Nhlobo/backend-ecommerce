/**
 * Newsletter Subscription Controller
 * Handles newsletter subscriptions, verification, and management
 */

const crypto = require('crypto');
const { query } = require('../db/connection');
const { sendNewsletterVerification } = require('../services/emailService');

/**
 * Subscribe to newsletter (public)
 * POST /api/newsletter/subscribe
 */
const subscribe = async (req, res) => {
    const { email } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    try {
        // Validate email
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Check if email already subscribed
        const existing = await query(
            'SELECT id, is_verified, unsubscribed_at FROM newsletter_subscribers WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existing.rows.length > 0) {
            const subscriber = existing.rows[0];
            
            // If previously unsubscribed, allow resubscription
            if (subscriber.unsubscribed_at) {
                const verificationToken = crypto.randomBytes(32).toString('hex');
                
                await query(
                    `UPDATE newsletter_subscribers
                     SET is_verified = false,
                         verification_token = $1,
                         unsubscribed_at = NULL,
                         subscribed_at = NOW(),
                         ip_address = $2,
                         user_agent = $3
                     WHERE id = $4`,
                    [verificationToken, ipAddress, userAgent, subscriber.id]
                );

                // Send verification email
                sendNewsletterVerification(email, verificationToken).catch(error => {
                    console.error('Failed to send newsletter verification:', error);
                });

                return res.json({
                    success: true,
                    message: 'Please check your email to confirm your subscription'
                });
            }

            // If already verified
            if (subscriber.is_verified) {
                return res.json({
                    success: true,
                    message: 'You are already subscribed to our newsletter'
                });
            }

            // If pending verification, resend
            return res.json({
                success: true,
                message: 'A verification email has already been sent. Please check your inbox.'
            });
        }

        // Create new subscription
        const verificationToken = crypto.randomBytes(32).toString('hex');

        await query(
            `INSERT INTO newsletter_subscribers (email, verification_token, ip_address, user_agent)
             VALUES ($1, $2, $3, $4)`,
            [email.toLowerCase(), verificationToken, ipAddress, userAgent]
        );

        // Send verification email (non-blocking)
        sendNewsletterVerification(email, verificationToken).catch(error => {
            console.error('Failed to send newsletter verification:', error);
        });

        res.json({
            success: true,
            message: 'Please check your email to confirm your subscription'
        });

    } catch (error) {
        console.error('Newsletter subscribe error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to subscribe. Please try again.'
        });
    }
};

/**
 * Verify newsletter subscription
 * GET /api/newsletter/verify/:token
 */
const verifySubscription = async (req, res) => {
    const { token } = req.params;

    try {
        // Find subscription with token
        const result = await query(
            'SELECT id, email, is_verified FROM newsletter_subscribers WHERE verification_token = $1',
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification token'
            });
        }

        const subscriber = result.rows[0];

        // Check if already verified
        if (subscriber.is_verified) {
            return res.json({
                success: true,
                message: 'Email already verified. You are subscribed to our newsletter!'
            });
        }

        // Verify subscription
        await query(
            `UPDATE newsletter_subscribers
             SET is_verified = true,
                 verification_token = NULL
             WHERE id = $1`,
            [subscriber.id]
        );

        res.json({
            success: true,
            message: 'Email verified successfully! You are now subscribed to our newsletter.'
        });

    } catch (error) {
        console.error('Newsletter verify error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify subscription. Please try again.'
        });
    }
};

/**
 * Unsubscribe from newsletter
 * POST /api/newsletter/unsubscribe
 */
const unsubscribe = async (req, res) => {
    const { email } = req.body;

    try {
        // Validate email
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Find subscription
        const result = await query(
            'SELECT id FROM newsletter_subscribers WHERE email = $1 AND unsubscribed_at IS NULL',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                message: 'Email is not subscribed or already unsubscribed'
            });
        }

        // Mark as unsubscribed
        await query(
            'UPDATE newsletter_subscribers SET unsubscribed_at = NOW() WHERE id = $1',
            [result.rows[0].id]
        );

        res.json({
            success: true,
            message: 'Successfully unsubscribed from newsletter'
        });

    } catch (error) {
        console.error('Newsletter unsubscribe error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unsubscribe. Please try again.'
        });
    }
};

/**
 * Get all subscribers (admin only)
 * GET /api/admin/newsletter/subscribers
 */
const getSubscribers = async (req, res) => {
    try {
        const { page = 1, limit = 50, status = 'active' } = req.query;
        const offset = (page - 1) * limit;

        // Build WHERE clause with safe values only
        const statusFilters = {
            'active': 'WHERE is_verified = true AND unsubscribed_at IS NULL',
            'pending': 'WHERE is_verified = false AND unsubscribed_at IS NULL',
            'unsubscribed': 'WHERE unsubscribed_at IS NOT NULL',
            'all': ''
        };
        
        const whereClause = statusFilters[status] || statusFilters['all'];

        const subscribers = await query(
            `SELECT id, email, is_verified, subscribed_at, unsubscribed_at
             FROM newsletter_subscribers
             ${whereClause}
             ORDER BY subscribed_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const countResult = await query(
            `SELECT COUNT(*) FROM newsletter_subscribers ${whereClause}`
        );
        const totalSubscribers = parseInt(countResult.rows[0].count);

        res.json({
            success: true,
            data: {
                subscribers: subscribers.rows,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalSubscribers / limit),
                    totalSubscribers,
                    limit: parseInt(limit)
                }
            }
        });

    } catch (error) {
        console.error('Get subscribers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch subscribers. Please try again.'
        });
    }
};

/**
 * Export subscribers as CSV (admin only)
 * GET /api/admin/newsletter/export
 */
const exportSubscribers = async (req, res) => {
    try {
        const { status = 'active' } = req.query;

        // Build WHERE clause with safe values only
        const statusFilters = {
            'active': 'WHERE is_verified = true AND unsubscribed_at IS NULL',
            'pending': 'WHERE is_verified = false AND unsubscribed_at IS NULL',
            'unsubscribed': 'WHERE unsubscribed_at IS NOT NULL',
            'all': ''
        };
        
        const whereClause = statusFilters[status] || statusFilters['all'];

        const subscribers = await query(
            `SELECT email, is_verified, subscribed_at, unsubscribed_at
             FROM newsletter_subscribers
             ${whereClause}
             ORDER BY subscribed_at DESC`
        );

        // Generate CSV
        let csv = 'Email,Verified,Subscribed At,Unsubscribed At\n';
        subscribers.rows.forEach(sub => {
            csv += `${sub.email},${sub.is_verified ? 'Yes' : 'No'},${sub.subscribed_at || ''},${sub.unsubscribed_at || ''}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=newsletter-subscribers-${status}-${Date.now()}.csv`);
        res.send(csv);

    } catch (error) {
        console.error('Export subscribers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export subscribers. Please try again.'
        });
    }
};

module.exports = {
    subscribe,
    verifySubscription,
    unsubscribe,
    getSubscribers,
    exportSubscribers
};
