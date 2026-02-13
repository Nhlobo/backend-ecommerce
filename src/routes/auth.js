const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getQuery, runQuery } = require('../config/database');
const { authenticateToken, generateToken } = require('../middleware/auth');

const router = express.Router();

// Compatibility routes for admin dashboards expecting /api/auth/* endpoints.
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const admin = await getQuery(
            'SELECT * FROM admins WHERE email = $1 AND is_active = TRUE',
            [email]
        );

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const isValidPassword = await bcrypt.compare(password, admin.password_hash);
        if (!isValidPassword) {
            await runQuery(
                'INSERT INTO activity_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)',
                [uuidv4(), admin.id, 'failed_login', 'Invalid password for admin login attempt']
            );

            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        await runQuery(
            'UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [admin.id]
        );

        const token = generateToken({
            id: admin.id,
            email: admin.email,
            role: 'admin'
        });

        await runQuery(
            'INSERT INTO activity_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)',
            [uuidv4(), admin.id, 'login', 'Admin logged in successfully via /api/auth/login']
        );

        return res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                admin: {
                    id: admin.id,
                    email: admin.email,
                    fullName: admin.full_name
                }
            }
        });
    } catch (error) {
        console.error('Auth login error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

router.post('/logout', authenticateToken, async (req, res) => {
    try {
        await runQuery(
            'INSERT INTO activity_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)',
            [uuidv4(), req.user.id, 'logout', 'Admin logged out via /api/auth/logout']
        );

        return res.json({
            success: true,
            message: 'Logout successful'
        });
    } catch (error) {
        console.error('Auth logout error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

router.get('/verify', authenticateToken, (req, res) => {
    return res.json({
        success: true,
        data: {
            user: req.user
        }
    });
});

module.exports = router;
