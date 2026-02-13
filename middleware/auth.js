/**
 * Authentication Middleware
 * Handles JWT token validation and admin authentication
 */

const jwt = require('jsonwebtoken');
const { query } = require('../db/connection');

/**
 * Verify JWT token and authenticate admin
 */
const authenticateAdmin = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required. No token provided.'
            });
        }
        
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if session exists and is valid
        const sessionResult = await query(
            `SELECT s.*, u.email, u.full_name, u.role, u.is_active
             FROM admin_sessions s
             JOIN admin_users u ON s.admin_id = u.id
             WHERE s.token = $1 AND s.expires_at > NOW()`,
            [token]
        );
        
        if (sessionResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Session expired or invalid. Please login again.'
            });
        }
        
        const session = sessionResult.rows[0];
        
        // Check if admin is active
        if (!session.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Account is disabled. Contact system administrator.'
            });
        }
        
        // Attach admin info to request
        req.admin = {
            id: session.admin_id,
            email: session.email,
            fullName: session.full_name,
            role: session.role
        };
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token. Please login again.'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired. Please login again.'
            });
        }
        
        console.error('Authentication error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication failed. Please try again.'
        });
    }
};

/**
 * Check if admin has required role
 */
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.'
            });
        }
        
        if (!allowedRoles.includes(req.admin.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to access this resource.'
            });
        }
        
        next();
    };
};

module.exports = {
    authenticateAdmin,
    requireRole
};
