const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getQuery, allQuery, runQuery } = require('../config/database');
const { authenticateToken, generateToken } = require('../middleware/auth');

// Admin login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find admin by email
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

        // Verify password
        const isValidPassword = await bcrypt.compare(password, admin.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Update last login
        await runQuery(
            'UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [admin.id]
        );

        // Generate JWT token
        const token = generateToken({
            id: admin.id,
            email: admin.email,
            role: 'admin'
        });

        // Log activity
        await runQuery(
            'INSERT INTO activity_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)',
            [require('uuid').v4(), admin.id, 'login', 'Admin logged in successfully']
        );

        res.json({
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
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Admin logout
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        // Log activity
        await runQuery(
            'INSERT INTO activity_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)',
            [require('uuid').v4(), req.user.id, 'logout', 'Admin logged out']
        );

        res.json({
            success: true,
            message: 'Logout successful'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Verify token
router.get('/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        data: {
            user: req.user
        }
    });
});

// Dashboard overview
router.get('/dashboard/overview', authenticateToken, async (req, res) => {
    try {
        // Get today's orders count and revenue
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const todayOrders = await getQuery(`
            SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
            FROM orders
            WHERE DATE(placed_at) = CURRENT_DATE
        `);

        // Get pending orders count
        const pendingOrders = await getQuery(`
            SELECT COUNT(*) as count
            FROM orders
            WHERE status = 'pending'
        `);

        // Get low stock products count
        const lowStockProducts = await getQuery(`
            SELECT COUNT(*) as count
            FROM products
            WHERE stock_quantity <= low_stock_threshold AND is_active = TRUE
        `);

        // Get recent transactions
        const recentTransactions = await allQuery(`
            SELECT id, order_number, customer_name, total_amount, status, placed_at
            FROM orders
            ORDER BY placed_at DESC
            LIMIT 10
        `);

        res.json({
            success: true,
            data: {
                ordersToday: {
                    count: todayOrders.count,
                    revenue: todayOrders.revenue
                },
                pendingOrders: pendingOrders.count,
                lowStockProducts: lowStockProducts.count,
                recentTransactions
            }
        });
    } catch (error) {
        console.error('Dashboard overview error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load dashboard overview'
        });
    }
});

// Get all orders
router.get('/orders', authenticateToken, async (req, res) => {
    try {
        const { status, search } = req.query;
        let sql = 'SELECT * FROM orders WHERE 1=1';
        const params = [];

        if (status) {
            sql += ' AND status = $1';
            params.push(status);
        }

        if (search) {
            const searchTerm = `%${search}%`;
            const paramIndex = params.length + 1;
            sql += ` AND (order_number LIKE $${paramIndex} OR customer_name LIKE $${paramIndex + 1} OR customer_email LIKE $${paramIndex + 2})`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        sql += ' ORDER BY placed_at DESC LIMIT 100';

        const orders = await allQuery(sql, params);

        res.json({
            success: true,
            data: orders
        });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load orders'
        });
    }
});

// Get payments
router.get('/payments', authenticateToken, async (req, res) => {
    try {
        const { status } = req.query;
        let sql = 'SELECT * FROM payments WHERE 1=1';
        const params = [];

        if (status) {
            sql += ' AND status = $1';
            params.push(status);
        }

        sql += ' ORDER BY created_at DESC LIMIT 100';

        const payments = await allQuery(sql, params);

        res.json({
            success: true,
            data: payments
        });
    } catch (error) {
        console.error('Get payments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load payments'
        });
    }
});

// Get customers
router.get('/customers', authenticateToken, async (req, res) => {
    try {
        const { search } = req.query;
        let sql = 'SELECT * FROM customers WHERE 1=1';
        const params = [];

        if (search) {
            const searchTerm = `%${search}%`;
            const paramIndex = params.length + 1;
            sql += ` AND (full_name LIKE $${paramIndex} OR email LIKE $${paramIndex + 1})`;
            params.push(searchTerm, searchTerm);
        }

        sql += ' ORDER BY created_at DESC LIMIT 100';

        const customers = await allQuery(sql, params);

        res.json({
            success: true,
            data: customers
        });
    } catch (error) {
        console.error('Get customers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load customers'
        });
    }
});

// Get products
router.get('/products', authenticateToken, async (req, res) => {
    try {
        const { category, search } = req.query;
        let sql = 'SELECT * FROM products WHERE 1=1';
        const params = [];

        if (category) {
            sql += ' AND category = $1';
            params.push(category);
        }

        if (search) {
            const searchTerm = `%${search}%`;
            const paramIndex = params.length + 1;
            sql += ` AND (name LIKE $${paramIndex} OR sku LIKE $${paramIndex + 1})`;
            params.push(searchTerm, searchTerm);
        }

        sql += ' ORDER BY created_at DESC LIMIT 100';

        const products = await allQuery(sql, params);

        res.json({
            success: true,
            data: products
        });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load products'
        });
    }
});

// Get discounts
router.get('/discounts', authenticateToken, async (req, res) => {
    try {
        const discounts = await allQuery(
            'SELECT * FROM discounts ORDER BY created_at DESC LIMIT 100'
        );

        res.json({
            success: true,
            data: discounts
        });
    } catch (error) {
        console.error('Get discounts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load discounts'
        });
    }
});

// Get returns
router.get('/returns', authenticateToken, async (req, res) => {
    try {
        const returns = await allQuery(
            'SELECT * FROM returns ORDER BY created_at DESC LIMIT 100'
        );

        res.json({
            success: true,
            data: returns
        });
    } catch (error) {
        console.error('Get returns error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load returns'
        });
    }
});

// Get VAT records
router.get('/compliance/vat', authenticateToken, async (req, res) => {
    try {
        // Calculate VAT from orders
        const vatRecords = await allQuery(`
            SELECT 
                id,
                order_number,
                customer_name,
                total_amount,
                ROUND(total_amount * 0.15 / 1.15, 2) as vat_amount,
                placed_at as date
            FROM orders
            WHERE payment_status = 'completed'
            ORDER BY placed_at DESC
            LIMIT 100
        `);

        res.json({
            success: true,
            data: vatRecords
        });
    } catch (error) {
        console.error('Get VAT records error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load VAT records'
        });
    }
});

// Get activity logs
router.get('/compliance/activity-logs', authenticateToken, async (req, res) => {
    try {
        const logs = await allQuery(`
            SELECT al.*, a.full_name as admin_name
            FROM activity_logs al
            LEFT JOIN admins a ON al.admin_id = a.id
            ORDER BY al.created_at DESC
            LIMIT 100
        `);

        res.json({
            success: true,
            data: logs
        });
    } catch (error) {
        console.error('Get activity logs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load activity logs'
        });
    }
});

// Get compliance policies
router.get('/compliance/policies', authenticateToken, async (req, res) => {
    try {
        // Return static compliance policies for now
        const policies = [
            {
                id: '1',
                name: 'POPIA Compliance',
                status: 'active',
                last_updated: new Date().toISOString()
            },
            {
                id: '2',
                name: 'VAT Registration',
                status: 'active',
                last_updated: new Date().toISOString()
            }
        ];

        res.json({
            success: true,
            data: policies
        });
    } catch (error) {
        console.error('Get policies error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load policies'
        });
    }
});

// Security events
router.get('/security/events', authenticateToken, async (req, res) => {
    try {
        const events = await allQuery(`
            SELECT * FROM activity_logs
            WHERE action IN ('login', 'logout', 'failed_login')
            ORDER BY created_at DESC
            LIMIT 100
        `);

        res.json({
            success: true,
            data: events
        });
    } catch (error) {
        console.error('Get security events error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load security events'
        });
    }
});

module.exports = router;
