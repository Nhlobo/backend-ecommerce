/**
 * Customer Authentication Routes
 * Public routes for customer registration, login, and password reset
 */

const express = require('express');
const router = express.Router();
const customerAuthController = require('../controllers/customerAuthController');
const { query } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');
const { validateRegister, validateLogin, validateResetPassword } = require('../middleware/validator');

const getCurrentUser = async (req, res) => {
    try {
        const result = await query(
            `SELECT id, name, email, email_verified, created_at, updated_at
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        return res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Get customer profile error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch user profile'
        });
    }
};

/**
 * POST /api/auth/register
 * Register a new customer account
 */
router.post('/register', authLimiter, validateRegister, customerAuthController.register);

/**
 * POST /api/auth/login
 * Customer login
 */
router.post('/login', authLimiter, validateLogin, customerAuthController.login);

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
router.post('/refresh', customerAuthController.refreshToken);

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password', authLimiter, customerAuthController.forgotPassword);

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', authLimiter, validateResetPassword, customerAuthController.resetPassword);

/**
 * POST /api/auth/verify-email
 * Verify email with token
 */
router.post('/verify-email', authLimiter, customerAuthController.verifyEmail);

/**
 * POST /api/auth/resend-verification
 * Resend verification email
 */
router.post('/resend-verification', authLimiter, customerAuthController.resendVerification);

/**
 * GET /api/auth/me
 * Get current customer profile
 */
router.get('/me', authenticateToken, getCurrentUser);

// Backward-compatible alias for frontend clients using /api/auth/user
router.get('/user', authenticateToken, getCurrentUser);

module.exports = router;
