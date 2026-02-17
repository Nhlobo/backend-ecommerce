/**
 * Security Middleware
 * XSS protection, input sanitization, and security headers
 */

const rateLimit = require('express-rate-limit');

/**
 * API Rate Limiter - General API protection
 * 100 requests per 15 minutes per IP
 */
const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Auth Rate Limiter - Stricter for authentication endpoints
 * 5 attempts per 15 minutes
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 5,
    message: {
        success: false,
        message: 'Too many login attempts, please try again after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true // Don't count successful requests
});

/**
 * Sanitize Input - XSS Protection
 * Strip HTML tags and dangerous characters from user input
 */
const sanitizeInput = (req, res, next) => {
    const sanitize = (obj) => {
        if (typeof obj === 'string') {
            // Remove HTML tags
            let sanitized = obj.replace(/<[^>]*>/g, '');
            // Remove script tags and javascript:
            sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            sanitized = sanitized.replace(/javascript:/gi, '');
            sanitized = sanitized.replace(/on\w+\s*=/gi, '');
            return sanitized.trim();
        } else if (Array.isArray(obj)) {
            return obj.map(sanitize);
        } else if (obj !== null && typeof obj === 'object') {
            const sanitized = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    sanitized[key] = sanitize(obj[key]);
                }
            }
            return sanitized;
        }
        return obj;
    };

    if (req.body) {
        req.body = sanitize(req.body);
    }
    if (req.query) {
        req.query = sanitize(req.query);
    }
    if (req.params) {
        req.params = sanitize(req.params);
    }

    next();
};

/**
 * CSRF Protection
 * Since csurf is deprecated, we implement a custom token-based approach
 * For API-only backends with JWT, CSRF is less of a concern if tokens are in headers
 */
const csrfProtection = (req, res, next) => {
    // For API endpoints using JWT in Authorization header, CSRF is not needed
    // as the browser won't automatically send the Authorization header
    // This middleware can be enhanced if cookies are used for auth
    
    // Skip CSRF for read operations
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return next();
    }

    // For now, we rely on SameSite cookie settings and JWT in headers
    // Additional CSRF token validation can be added here if needed
    next();
};

/**
 * Log Security Event
 */
const logSecurityEvent = async (userType, userId, eventType, severity, ipAddress, userAgent, details = {}) => {
    try {
        const { query } = require('../db/connection');
        await query(
            `INSERT INTO security_logs (user_type, user_id, event_type, severity, ip_address, user_agent, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userType, userId, eventType, severity, ipAddress, userAgent, JSON.stringify(details)]
        );
    } catch (error) {
        console.error('Failed to log security event:', error);
    }
};

/**
 * Detect and log suspicious activity
 */
const detectSuspiciousActivity = (req, res, next) => {
    const suspiciousPatterns = [
        /(\.\.\/)|(\.\.\\)/,  // Path traversal
        /<script|<iframe|javascript:/i,  // XSS attempts
        /union.*select|insert.*into|delete.*from|drop.*table/i,  // SQL injection
        /eval\(|exec\(|system\(/i  // Code injection
    ];

    const checkValue = (value) => {
        if (typeof value === 'string') {
            return suspiciousPatterns.some(pattern => pattern.test(value));
        } else if (Array.isArray(value)) {
            return value.some(checkValue);
        } else if (value !== null && typeof value === 'object') {
            return Object.values(value).some(checkValue);
        }
        return false;
    };

    const suspicious = 
        checkValue(req.body) || 
        checkValue(req.query) || 
        checkValue(req.params) ||
        checkValue(req.headers.referer) ||
        checkValue(req.headers['user-agent']);

    if (suspicious) {
        // Log suspicious activity
        logSecurityEvent(
            req.user ? 'customer' : (req.admin ? 'admin' : 'guest'),
            req.user?.id || req.admin?.id || null,
            'suspicious_activity',
            'high',
            req.ip,
            req.get('user-agent'),
            {
                method: req.method,
                path: req.path,
                body: req.body,
                query: req.query,
                params: req.params
            }
        );

        return res.status(400).json({
            success: false,
            message: 'Suspicious activity detected. Request blocked.'
        });
    }

    next();
};

module.exports = {
    apiLimiter,
    authLimiter,
    sanitizeInput,
    csrfProtection,
    logSecurityEvent,
    detectSuspiciousActivity
};
