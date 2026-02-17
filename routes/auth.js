/**
 * Customer Authentication Routes
 * Public routes for customer registration, login, and password reset
 */

const express = require('express');
const router = express.Router();
const customerAuthController = require('../controllers/customerAuthController');
const { authLimiter } = require('../middleware/security');
const { validateRegister, validateLogin, validateResetPassword } = require('../middleware/validator');

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

module.exports = router;
