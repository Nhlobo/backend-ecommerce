/**
 * Rate Limiting Middleware
 * Protects against brute-force attacks and API abuse
 */

const rateLimit = require('express-rate-limit');
const { query } = require('../db/connection');

/**
 * General API rate limiter
 */
const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        success: false,
        message: 'Too many requests from this IP. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Strict rate limiter for login attempts
 */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 5,
    skipSuccessfulRequests: true,
    message: {
        success: false,
        message: 'Too many login attempts. Please try again in 15 minutes.'
    },
    handler: async (req, res) => {
        // Log security event
        try {
            await query(
                `INSERT INTO security_events (event_type, severity, description, ip_address, user_agent)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    'rate_limit_exceeded',
                    'medium',
                    'Login rate limit exceeded',
                    req.ip,
                    req.get('user-agent')
                ]
            );
        } catch (error) {
            console.error('Error logging security event:', error);
        }
        
        res.status(429).json({
            success: false,
            message: 'Too many login attempts. Your IP has been temporarily blocked. Please try again in 15 minutes.'
        });
    }
});

/**
 * Check login attempts for specific email/IP
 */
const checkLoginAttempts = async (req, res, next) => {
    const { email } = req.body;
    const ipAddress = req.ip;
    
    try {
        // Check failed attempts in last 15 minutes
        const result = await query(
            `SELECT COUNT(*) as attempts 
             FROM login_attempts 
             WHERE (email = $1 OR ip_address = $2) 
             AND success = false 
             AND attempted_at > NOW() - INTERVAL '15 minutes'`,
            [email, ipAddress]
        );
        
        const attempts = parseInt(result.rows[0].attempts);
        
        if (attempts >= 5) {
            // Log security event
            await query(
                `INSERT INTO security_events (event_type, severity, description, ip_address, user_agent)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    'excessive_login_attempts',
                    'high',
                    `Excessive failed login attempts for ${email}`,
                    ipAddress,
                    req.get('user-agent')
                ]
            );
            
            return res.status(429).json({
                success: false,
                message: 'Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes or contact support.'
            });
        }
        
        next();
    } catch (error) {
        console.error('Error checking login attempts:', error);
        next(); // Continue even if check fails
    }
};

/**
 * Log login attempt
 */
const logLoginAttempt = async (email, ipAddress, success) => {
    try {
        await query(
            `INSERT INTO login_attempts (email, ip_address, success)
             VALUES ($1, $2, $3)`,
            [email, ipAddress, success]
        );
    } catch (error) {
        console.error('Error logging login attempt:', error);
    }
};

module.exports = {
    apiLimiter,
    loginLimiter,
    checkLoginAttempts,
    logLoginAttempt
};
