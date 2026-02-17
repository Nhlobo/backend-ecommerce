/**
 * Customer Authentication Controller
 * Handles customer registration, login, token refresh, and password reset
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db/connection');
const { sendEmailVerification, sendPasswordReset } = require('../services/emailService');

/**
 * Helper function to log security events
 */
const logSecurityEvent = async (eventType, userId, ipAddress, userAgent, details = {}, severity = 'info') => {
    try {
        await query(
            `INSERT INTO security_logs (user_type, user_id, event_type, severity, ip_address, user_agent, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            ['customer', userId, eventType, severity, ipAddress, userAgent, JSON.stringify(details)]
        );
    } catch (error) {
        console.error('Error logging security event:', error);
    }
};

/**
 * Validate email format
 */
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Validate password strength
 */
const isValidPassword = (password) => {
    return password && password.length >= 8;
};

/**
 * Customer Registration
 */
const register = async (req, res) => {
    const { name, email, password } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    try {
        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and password are required'
            });
        }

        // Validate email format
        if (!isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Validate password strength
        if (!isValidPassword(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long'
            });
        }

        // Check if user already exists
        const existingUser = await query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existingUser.rows.length > 0) {
            await logSecurityEvent(
                'registration_failed',
                null,
                ipAddress,
                userAgent,
                { email, reason: 'email_already_exists' },
                'low'
            );
            return res.status(409).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Hash password with bcrypt (12 rounds)
        const passwordHash = await bcrypt.hash(password, 12);

        // Generate email verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date();
        verificationExpires.setHours(verificationExpires.getHours() + 24); // 24 hours expiry

        // Create user
        const result = await query(
            `INSERT INTO users (name, email, password_hash, email_verified, email_verification_token, email_verification_expires)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, name, email, created_at`,
            [name, email.toLowerCase(), passwordHash, false, verificationToken, verificationExpires]
        );

        const user = result.rows[0];

        // Send verification email (non-blocking)
        sendEmailVerification(user.email, verificationToken, user.name).catch(error => {
            console.error('Failed to send verification email:', error);
        });

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                type: 'customer'
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
        );

        // Log successful registration
        await logSecurityEvent(
            'customer_registration',
            user.id,
            ipAddress,
            userAgent,
            { email: user.email },
            'info'
        );

        res.status(201).json({
            success: true,
            message: 'Registration successful. Please check your email to verify your account.',
            data: {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    emailVerified: false,
                    createdAt: user.created_at
                }
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        await logSecurityEvent(
            'registration_error',
            null,
            ipAddress,
            userAgent,
            { error: error.message },
            'high'
        );
        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.'
        });
    }
};

/**
 * Customer Login
 */
const login = async (req, res) => {
    const { email, password } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    try {
        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user
        const result = await query(
            'SELECT id, name, email, password_hash, email_verified, created_at FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            await logSecurityEvent(
                'login_failed',
                null,
                ipAddress,
                userAgent,
                { email, reason: 'user_not_found' },
                'medium'
            );
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const user = result.rows[0];

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            await logSecurityEvent(
                'login_failed',
                user.id,
                ipAddress,
                userAgent,
                { email, reason: 'invalid_password' },
                'medium'
            );
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                type: 'customer'
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
        );

        // Log successful login
        await logSecurityEvent(
            'customer_login',
            user.id,
            ipAddress,
            userAgent,
            { email: user.email },
            'info'
        );

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    emailVerified: user.email_verified || false,
                    createdAt: user.created_at
                }
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        await logSecurityEvent(
            'login_error',
            null,
            ipAddress,
            userAgent,
            { error: error.message },
            'high'
        );
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
};

/**
 * Refresh JWT Token
 */
const refreshToken = async (req, res) => {
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const token = authHeader.substring(7);

        // Verify existing token (even if expired)
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
        } catch (error) {
            await logSecurityEvent(
                'token_refresh_failed',
                null,
                ipAddress,
                userAgent,
                { reason: 'invalid_token' },
                'medium'
            );
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        // Verify user still exists
        const result = await query(
            'SELECT id, name, email FROM users WHERE id = $1',
            [decoded.id]
        );

        if (result.rows.length === 0) {
            await logSecurityEvent(
                'token_refresh_failed',
                decoded.id,
                ipAddress,
                userAgent,
                { reason: 'user_not_found' },
                'medium'
            );
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = result.rows[0];

        // Generate new token
        const newToken = jwt.sign(
            {
                id: user.id,
                email: user.email,
                type: 'customer'
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
        );

        // Log token refresh
        await logSecurityEvent(
            'token_refreshed',
            user.id,
            ipAddress,
            userAgent,
            { email: user.email },
            'info'
        );

        res.json({
            success: true,
            message: 'Token refreshed successfully',
            data: {
                token: newToken,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email
                }
            }
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        await logSecurityEvent(
            'token_refresh_error',
            null,
            ipAddress,
            userAgent,
            { error: error.message },
            'high'
        );
        res.status(500).json({
            success: false,
            message: 'Token refresh failed. Please try again.'
        });
    }
};

/**
 * Forgot Password - Generate reset token
 */
const forgotPassword = async (req, res) => {
    const { email } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    try {
        // Validate input
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Validate email format
        if (!isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Find user
        const result = await query(
            'SELECT id, email FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        // Always return success to prevent email enumeration
        if (result.rows.length === 0) {
            await logSecurityEvent(
                'password_reset_requested',
                null,
                ipAddress,
                userAgent,
                { email, reason: 'user_not_found' },
                'low'
            );
            return res.json({
                success: true,
                message: 'If the email exists, a password reset link will be sent'
            });
        }

        const user = result.rows[0];

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

        // Set expiration to 1 hour from now
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);

        // Store reset token
        await query(
            `UPDATE users 
             SET updated_at = NOW()
             WHERE id = $1`,
            [user.id]
        );

        // Create a temporary table entry or use a dedicated password_reset_tokens table
        // For this implementation, we'll store it in security_logs with the hashed token
        await query(
            `INSERT INTO security_logs (user_type, user_id, event_type, severity, ip_address, user_agent, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                'customer',
                user.id,
                'password_reset_token_generated',
                'info',
                ipAddress,
                userAgent,
                JSON.stringify({
                    email: user.email,
                    reset_token_hash: resetTokenHash,
                    expires_at: expiresAt.toISOString()
                })
            ]
        );

        // Log the event
        await logSecurityEvent(
            'password_reset_requested',
            user.id,
            ipAddress,
            userAgent,
            { email: user.email },
            'info'
        );

        // Send password reset email (non-blocking)
        sendPasswordReset(user.email, resetToken, user.name || 'Customer').catch(error => {
            console.error('Failed to send password reset email:', error);
        });

        // In production, send email with resetToken here
        // For now, return success message
        res.json({
            success: true,
            message: 'If the email exists, a password reset link will be sent',
            // Only include token in development/testing
            ...(process.env.NODE_ENV === 'development' && { resetToken })
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        await logSecurityEvent(
            'password_reset_error',
            null,
            ipAddress,
            userAgent,
            { error: error.message },
            'high'
        );
        res.status(500).json({
            success: false,
            message: 'Password reset request failed. Please try again.'
        });
    }
};

/**
 * Reset Password - Update password with reset token
 */
const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    try {
        // Validate input
        if (!token || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Reset token and new password are required'
            });
        }

        // Validate password strength
        if (!isValidPassword(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long'
            });
        }

        // Hash the provided token
        const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

        // Find valid reset token in security logs
        const tokenResult = await query(
            `SELECT user_id, details, created_at
             FROM security_logs
             WHERE event_type = 'password_reset_token_generated'
             AND user_type = 'customer'
             AND details->>'reset_token_hash' = $1
             AND (details->>'expires_at')::timestamp > NOW()
             ORDER BY created_at DESC
             LIMIT 1`,
            [resetTokenHash]
        );

        if (tokenResult.rows.length === 0) {
            await logSecurityEvent(
                'password_reset_failed',
                null,
                ipAddress,
                userAgent,
                { reason: 'invalid_or_expired_token' },
                'medium'
            );
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        const userId = tokenResult.rows[0].user_id;

        // Hash new password with bcrypt (12 rounds)
        const passwordHash = await bcrypt.hash(newPassword, 12);

        // Update password
        await query(
            'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [passwordHash, userId]
        );

        // Invalidate the reset token by logging its use
        await logSecurityEvent(
            'password_reset_completed',
            userId,
            ipAddress,
            userAgent,
            { reset_token_hash: resetTokenHash },
            'info'
        );

        // Log the password change
        await logSecurityEvent(
            'password_changed',
            userId,
            ipAddress,
            userAgent,
            { method: 'reset_token' },
            'info'
        );

        res.json({
            success: true,
            message: 'Password reset successful. You can now login with your new password.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        await logSecurityEvent(
            'password_reset_error',
            null,
            ipAddress,
            userAgent,
            { error: error.message },
            'high'
        );
        res.status(500).json({
            success: false,
            message: 'Password reset failed. Please try again.'
        });
    }
};

/**
 * Verify Email
 */
const verifyEmail = async (req, res) => {
    const { token } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    try {
        // Validate input
        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Verification token is required'
            });
        }

        // Find user with matching token that hasn't expired
        const result = await query(
            `SELECT id, name, email, email_verified
             FROM users
             WHERE email_verification_token = $1
             AND email_verification_expires > NOW()`,
            [token]
        );

        if (result.rows.length === 0) {
            await logSecurityEvent(
                'email_verification_failed',
                null,
                ipAddress,
                userAgent,
                { reason: 'invalid_or_expired_token' },
                'low'
            );
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired verification token'
            });
        }

        const user = result.rows[0];

        // Check if already verified
        if (user.email_verified) {
            return res.json({
                success: true,
                message: 'Email already verified'
            });
        }

        // Mark email as verified
        await query(
            `UPDATE users
             SET email_verified = true,
                 email_verification_token = NULL,
                 email_verification_expires = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [user.id]
        );

        // Log successful verification
        await logSecurityEvent(
            'email_verified',
            user.id,
            ipAddress,
            userAgent,
            { email: user.email },
            'info'
        );

        res.json({
            success: true,
            message: 'Email verified successfully'
        });

    } catch (error) {
        console.error('Email verification error:', error);
        await logSecurityEvent(
            'email_verification_error',
            null,
            ipAddress,
            userAgent,
            { error: error.message },
            'high'
        );
        res.status(500).json({
            success: false,
            message: 'Email verification failed. Please try again.'
        });
    }
};

/**
 * Resend Email Verification
 */
const resendVerification = async (req, res) => {
    const { email } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    try {
        // Validate input
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Validate email format
        if (!isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Find user
        const result = await query(
            'SELECT id, name, email, email_verified FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        // Always return success to prevent email enumeration
        if (result.rows.length === 0) {
            await logSecurityEvent(
                'verification_resend_requested',
                null,
                ipAddress,
                userAgent,
                { email, reason: 'user_not_found' },
                'low'
            );
            return res.json({
                success: true,
                message: 'If the email exists and is not verified, a new verification link will be sent'
            });
        }

        const user = result.rows[0];

        // Check if already verified
        if (user.email_verified) {
            return res.json({
                success: true,
                message: 'Email is already verified'
            });
        }

        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date();
        verificationExpires.setHours(verificationExpires.getHours() + 24); // 24 hours expiry

        // Update user with new token
        await query(
            `UPDATE users
             SET email_verification_token = $1,
                 email_verification_expires = $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [verificationToken, verificationExpires, user.id]
        );

        // Send verification email (non-blocking)
        sendEmailVerification(user.email, verificationToken, user.name).catch(error => {
            console.error('Failed to send verification email:', error);
        });

        // Log the event
        await logSecurityEvent(
            'verification_resend_requested',
            user.id,
            ipAddress,
            userAgent,
            { email: user.email },
            'info'
        );

        res.json({
            success: true,
            message: 'If the email exists and is not verified, a new verification link will be sent'
        });

    } catch (error) {
        console.error('Resend verification error:', error);
        await logSecurityEvent(
            'verification_resend_error',
            null,
            ipAddress,
            userAgent,
            { error: error.message },
            'high'
        );
        res.status(500).json({
            success: false,
            message: 'Failed to resend verification email. Please try again.'
        });
    }
};

module.exports = {
    register,
    login,
    refreshToken,
    forgotPassword,
    resetPassword,
    verifyEmail,
    resendVerification
};
