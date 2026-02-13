const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body } = require('express-validator');
const { getQuery, allQuery, runQuery } = require('../config/database');
const { authenticateToken, generateToken } = require('../middleware/auth');
const { validateRequest, validatePassword } = require('../utils/validation');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');

const router = express.Router();

// Customer registration
router.post(
    '/register',
    [
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').notEmpty().withMessage('Password is required'),
        body('full_name').notEmpty().withMessage('Full name is required'),
        body('phone').optional()
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { email, password, full_name, phone } = req.body;

            // Validate password strength
            const passwordValidation = validatePassword(password);
            if (!passwordValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    message: passwordValidation.message
                });
            }

            // Check if customer already exists
            const existingCustomer = await getQuery(
                'SELECT id FROM customers WHERE email = $1',
                [email]
            );

            if (existingCustomer) {
                return res.status(409).json({
                    success: false,
                    message: 'Email already registered'
                });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create customer
            const customerId = uuidv4();
            await runQuery(
                `INSERT INTO customers (id, email, password_hash, full_name, phone, is_active)
                 VALUES ($1, $2, $3, $4, $5, TRUE)`,
                [customerId, email, hashedPassword, full_name, phone]
            );

            // Generate token
            const token = generateToken({
                id: customerId,
                email,
                role: 'customer'
            });

            res.status(201).json({
                success: true,
                message: 'Registration successful',
                data: {
                    token,
                    customer: {
                        id: customerId,
                        email,
                        full_name
                    }
                }
            });
        } catch (error) {
            console.error('Customer registration error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to register customer'
            });
        }
    }
);

// Customer login
router.post(
    '/login',
    [
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { email, password } = req.body;

            // Find customer
            const customer = await getQuery(
                'SELECT * FROM customers WHERE email = $1',
                [email]
            );

            if (!customer) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
            }

            // Check if account is active
            if (!customer.is_active) {
                return res.status(403).json({
                    success: false,
                    message: 'Account has been deactivated'
                });
            }

            // Verify password
            const isValidPassword = await bcrypt.compare(password, customer.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
            }

            // Generate token
            const token = generateToken({
                id: customer.id,
                email: customer.email,
                role: 'customer'
            });

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    token,
                    customer: {
                        id: customer.id,
                        email: customer.email,
                        full_name: customer.full_name,
                        phone: customer.phone
                    }
                }
            });
        } catch (error) {
            console.error('Customer login error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to login'
            });
        }
    }
);

// Get customer profile (authenticated)
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        // Ensure user is a customer
        if (req.user.role !== 'customer') {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const customer = await getQuery(
            'SELECT id, email, full_name, phone, is_active, created_at FROM customers WHERE id = $1',
            [req.user.id]
        );

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        res.json({
            success: true,
            data: customer
        });
    } catch (error) {
        console.error('Get customer profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load profile'
        });
    }
});

// Update customer profile (authenticated)
router.put(
    '/profile',
    authenticateToken,
    [
        body('full_name').optional().notEmpty().withMessage('Full name cannot be empty'),
        body('phone').optional(),
        body('current_password').optional(),
        body('new_password').optional()
    ],
    validateRequest,
    async (req, res) => {
        try {
            // Ensure user is a customer
            if (req.user.role !== 'customer') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            const { full_name, phone, current_password, new_password } = req.body;

            // Get current customer data
            const customer = await getQuery(
                'SELECT * FROM customers WHERE id = $1',
                [req.user.id]
            );

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: 'Customer not found'
                });
            }

            // Handle password change if requested
            if (new_password) {
                if (!current_password) {
                    return res.status(400).json({
                        success: false,
                        message: 'Current password is required to set new password'
                    });
                }

                // Verify current password
                const isValidPassword = await bcrypt.compare(current_password, customer.password_hash);
                if (!isValidPassword) {
                    return res.status(401).json({
                        success: false,
                        message: 'Current password is incorrect'
                    });
                }

                // Validate new password
                const passwordValidation = validatePassword(new_password);
                if (!passwordValidation.isValid) {
                    return res.status(400).json({
                        success: false,
                        message: passwordValidation.message
                    });
                }

                // Hash and update password
                const hashedPassword = await bcrypt.hash(new_password, 10);
                await runQuery(
                    'UPDATE customers SET password_hash = $1 WHERE id = $2',
                    [hashedPassword, req.user.id]
                );
            }

            // Update other fields
            const updates = [];
            const params = [];
            let paramIndex = 1;

            if (full_name !== undefined) {
                updates.push(`full_name = $${paramIndex++}`);
                params.push(full_name);
            }

            if (phone !== undefined) {
                updates.push(`phone = $${paramIndex++}`);
                params.push(phone);
            }

            if (updates.length > 0) {
                params.push(req.user.id);
                await runQuery(
                    `UPDATE customers SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
                    params
                );
            }

            // Get updated customer data
            const updatedCustomer = await getQuery(
                'SELECT id, email, full_name, phone, is_active FROM customers WHERE id = $1',
                [req.user.id]
            );

            res.json({
                success: true,
                message: 'Profile updated successfully',
                data: updatedCustomer
            });
        } catch (error) {
            console.error('Update customer profile error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update profile'
            });
        }
    }
);

// Get customer order history (authenticated)
router.get('/orders', authenticateToken, async (req, res) => {
    try {
        // Ensure user is a customer
        if (req.user.role !== 'customer') {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const { page, limit, offset } = getPaginationParams(req.query);

        // Get total count
        const countResult = await getQuery(
            'SELECT COUNT(*) as total FROM orders WHERE customer_id = $1',
            [req.user.id]
        );
        const total = parseInt(countResult.total, 10);

        // Get orders with pagination
        const orders = await allQuery(
            `SELECT * FROM orders 
             WHERE customer_id = $1 
             ORDER BY placed_at DESC 
             LIMIT $2 OFFSET $3`,
            [req.user.id, limit, offset]
        );

        // Get all items for these orders in a single query (optimization to avoid N+1 queries)
        if (orders.length > 0) {
            const orderIds = orders.map(o => o.id);
            const allItems = await allQuery(
                `SELECT * FROM order_items WHERE order_id = ANY($1::varchar[])`,
                [orderIds]
            );

            // Map items to their respective orders
            const itemsByOrder = {};
            for (const item of allItems) {
                if (!itemsByOrder[item.order_id]) {
                    itemsByOrder[item.order_id] = [];
                }
                itemsByOrder[item.order_id].push(item);
            }

            // Attach items to orders
            for (const order of orders) {
                order.items = itemsByOrder[order.id] || [];
            }
        }

        res.json({
            success: true,
            data: orders,
            meta: buildPaginationMeta(page, limit, total)
        });
    } catch (error) {
        console.error('Get customer orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load orders'
        });
    }
});

module.exports = router;
