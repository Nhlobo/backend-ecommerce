/**
 * Authentication Controller
 * Handles admin login, logout, and session management
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, transaction } = require('../db/connection');
const { logLoginAttempt } = require('../middleware/rateLimiter');

/**
 * Admin Login
 */
const login = async (req, res) => {
    const { email, password } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');
    
    try {
        // Find admin user
        const result = await query(
            'SELECT * FROM admin_users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            await logLoginAttempt(email, ipAddress, false);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        const admin = result.rows[0];
        
        // Check if account is active
        if (!admin.is_active) {
            await logLoginAttempt(email, ipAddress, false);
            return res.status(403).json({
                success: false,
                message: 'Account is disabled. Contact system administrator.'
            });
        }
        
        // Verify password
        const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
        
        if (!isPasswordValid) {
            await logLoginAttempt(email, ipAddress, false);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                id: admin.id,
                email: admin.email,
                role: admin.role
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        
        // Calculate expiration time
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        
        // Create session
        await query(
            `INSERT INTO admin_sessions (admin_id, token, ip_address, user_agent, expires_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [admin.id, token, ipAddress, userAgent, expiresAt]
        );
        
        // Update last login
        await query(
            'UPDATE admin_users SET last_login = NOW() WHERE id = $1',
            [admin.id]
        );
        
        // Log successful login
        await logLoginAttempt(email, ipAddress, true);
        
        // Log activity
        await query(
            `INSERT INTO activity_logs (admin_id, action, ip_address, user_agent, severity)
             VALUES ($1, $2, $3, $4, $5)`,
            [admin.id, 'admin_login', ipAddress, userAgent, 'info']
        );
        
        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                admin: {
                    id: admin.id,
                    email: admin.email,
                    fullName: admin.full_name,
                    role: admin.role
                }
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
};

/**
 * Admin Logout
 */
const logout = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            
            // Delete session
            await query(
                'DELETE FROM admin_sessions WHERE token = $1',
                [token]
            );
            
            // Log activity
            if (req.admin) {
                await query(
                    `INSERT INTO activity_logs (admin_id, action, ip_address, user_agent, severity)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [req.admin.id, 'admin_logout', req.ip, req.get('user-agent'), 'info']
                );
            }
        }
        
        res.json({
            success: true,
            message: 'Logout successful'
        });
        
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed. Please try again.'
        });
    }
};

/**
 * Get current admin info
 */
const getCurrentAdmin = async (req, res) => {
    try {
        const result = await query(
            `SELECT id, email, full_name, role, last_login, created_at
             FROM admin_users WHERE id = $1`,
            [req.admin.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Get current admin error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch admin info'
        });
    }
};

/**
 * Change password
 */
const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    try {
        // Get admin with password
        const result = await query(
            'SELECT password_hash FROM admin_users WHERE id = $1',
            [req.admin.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }
        
        // Verify current password
        const isPasswordValid = await bcrypt.compare(
            currentPassword,
            result.rows[0].password_hash
        );
        
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }
        
        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 12);
        
        // Update password
        await query(
            'UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [newPasswordHash, req.admin.id]
        );
        
        // Log activity
        await query(
            `INSERT INTO activity_logs (admin_id, action, ip_address, user_agent, severity)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.admin.id, 'password_changed', req.ip, req.get('user-agent'), 'info']
        );
        
        res.json({
            success: true,
            message: 'Password changed successfully'
        });
        
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to change password'
        });
    }
};

module.exports = {
    login,
    logout,
    getCurrentAdmin,
    changePassword
};
