const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getQuery, allQuery, runQuery } = require('../config/database');
const { authenticateToken, generateToken } = require('../middleware/auth');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');

// Helper function to log admin activities
async function logActivity(adminId, action, details) {
    try {
        await runQuery(
            'INSERT INTO activity_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)',
            [uuidv4(), adminId, action, details]
        );
    } catch (error) {
        console.error('Error logging activity:', error);
    }
}

// Helper function to handle validation errors
function handleValidationErrors(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    return null;
}

// Helper function to sanitize LIKE patterns (prevent wildcard injection)
function sanitizeLikePattern(input) {
    if (!input) return '';
    // Escape special LIKE characters: % and _
    return input.replace(/[%_]/g, '\\$&');
}

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

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

        await logActivity(admin.id, 'login', 'Admin logged in successfully');

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
        await logActivity(req.user.id, 'logout', 'Admin logged out');

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

// ============================================================================
// DASHBOARD & ANALYTICS ENDPOINTS
// ============================================================================

// Dashboard overview
router.get('/dashboard/overview', authenticateToken, async (req, res) => {
    try {
        const todayOrders = await getQuery(`
            SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
            FROM orders
            WHERE DATE(placed_at) = CURRENT_DATE
        `);

        const pendingOrders = await getQuery(`
            SELECT COUNT(*) as count
            FROM orders
            WHERE status = 'pending'
        `);

        const lowStockProducts = await getQuery(`
            SELECT COUNT(*) as count
            FROM products
            WHERE stock_quantity <= low_stock_threshold AND is_active = TRUE
        `);

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

// Dashboard stats with detailed analytics
router.get('/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        let dateFilter = '';
        const params = [];
        
        if (start_date && end_date) {
            dateFilter = 'WHERE placed_at BETWEEN $1 AND $2';
            params.push(start_date, end_date);
        } else if (start_date) {
            dateFilter = 'WHERE placed_at >= $1';
            params.push(start_date);
        } else if (end_date) {
            dateFilter = 'WHERE placed_at <= $1';
            params.push(end_date);
        }

        // Sales over time (daily for last 30 days or custom range)
        const salesOverTime = await allQuery(`
            SELECT 
                DATE(placed_at) as date,
                COUNT(*) as order_count,
                COALESCE(SUM(total_amount), 0) as revenue
            FROM orders
            ${dateFilter}
            GROUP BY DATE(placed_at)
            ORDER BY date DESC
            LIMIT 30
        `, params);

        // Orders by status
        const ordersByStatus = await allQuery(`
            SELECT status, COUNT(*) as count
            FROM orders
            ${dateFilter}
            GROUP BY status
        `, params);

        // Top selling products
        const topProducts = await allQuery(`
            SELECT 
                oi.product_name,
                SUM(oi.quantity) as total_quantity,
                SUM(oi.total_price) as total_revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            ${dateFilter.replace('placed_at', 'o.placed_at')}
            GROUP BY oi.product_name
            ORDER BY total_quantity DESC
            LIMIT 10
        `, params);

        // Revenue by payment method
        const revenueByPaymentMethod = await allQuery(`
            SELECT 
                payment_method,
                COUNT(*) as order_count,
                COALESCE(SUM(total_amount), 0) as revenue
            FROM orders
            ${dateFilter ? dateFilter + ' AND' : 'WHERE'} payment_status = 'completed'
            GROUP BY payment_method
        `, params);

        // Total statistics
        const totalStats = await getQuery(`
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total_amount), 0) as total_revenue,
                COALESCE(AVG(total_amount), 0) as avg_order_value
            FROM orders
            ${dateFilter ? dateFilter + ' AND' : 'WHERE'} payment_status = 'completed'
        `, params);

        res.json({
            success: true,
            data: {
                salesOverTime,
                ordersByStatus,
                topProducts,
                revenueByPaymentMethod,
                totalStats
            }
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load dashboard statistics'
        });
    }
});

// ============================================================================
// PRODUCT MANAGEMENT ENDPOINTS
// ============================================================================

// Get all products with pagination
router.get('/products', authenticateToken, async (req, res) => {
    try {
        const { category, search } = req.query;
        const { page, limit, offset } = getPaginationParams(req.query);
        
        let sql = 'SELECT * FROM products WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (category) {
            sql += ` AND category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }

        if (search) {
            const searchTerm = `%${sanitizeLikePattern(search)}%`;
            sql += ` AND (name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex})`;
            params.push(searchTerm);
            paramIndex++;
        }

        // Get total count
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const totalResult = await getQuery(countSql, params);
        const total = parseInt(totalResult.total, 10);

        // Get paginated results
        sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        const products = await allQuery(sql, params);

        res.json({
            success: true,
            message: 'Products retrieved successfully',
            data: products,
            meta: buildPaginationMeta(page, limit, total)
        });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load products'
        });
    }
});

// Create new product
router.post('/products', [
    authenticateToken,
    body('sku').notEmpty().withMessage('SKU is required'),
    body('name').notEmpty().withMessage('Product name is required'),
    body('category').notEmpty().withMessage('Category is required'),
    body('price_excl_vat').isFloat({ min: 0 }).withMessage('Valid price excluding VAT is required'),
    body('price_incl_vat').isFloat({ min: 0 }).withMessage('Valid price including VAT is required'),
    body('stock_quantity').isInt({ min: 0 }).withMessage('Valid stock quantity is required'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { sku, name, description, category, price_excl_vat, price_incl_vat, 
                stock_quantity, low_stock_threshold, image_url } = req.body;

        // Check if SKU already exists
        const existingProduct = await getQuery('SELECT id FROM products WHERE sku = $1', [sku]);
        if (existingProduct) {
            return res.status(400).json({
                success: false,
                message: 'Product with this SKU already exists'
            });
        }

        const productId = uuidv4();
        await runQuery(`
            INSERT INTO products (id, sku, name, description, category, price_excl_vat, 
                price_incl_vat, stock_quantity, low_stock_threshold, image_url, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
        `, [productId, sku, name, description || null, category, price_excl_vat, price_incl_vat, 
            stock_quantity, low_stock_threshold || 10, image_url || null]);

        await logActivity(req.user.id, 'create_product', `Created product: ${name} (${sku})`);

        const product = await getQuery('SELECT * FROM products WHERE id = $1', [productId]);

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product
        });
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create product'
        });
    }
});

// Update existing product
router.put('/products/:id', [
    authenticateToken,
    body('name').optional().notEmpty().withMessage('Product name cannot be empty'),
    body('price_excl_vat').optional().isFloat({ min: 0 }).withMessage('Valid price excluding VAT is required'),
    body('price_incl_vat').optional().isFloat({ min: 0 }).withMessage('Valid price including VAT is required'),
    body('stock_quantity').optional().isInt({ min: 0 }).withMessage('Valid stock quantity is required'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { id } = req.params;
        const { sku, name, description, category, price_excl_vat, price_incl_vat, 
                stock_quantity, low_stock_threshold, image_url, is_active } = req.body;

        // Check if product exists
        const existingProduct = await getQuery('SELECT * FROM products WHERE id = $1', [id]);
        if (!existingProduct) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if SKU is being changed and if new SKU already exists
        if (sku && sku !== existingProduct.sku) {
            const skuExists = await getQuery('SELECT id FROM products WHERE sku = $1 AND id != $2', [sku, id]);
            if (skuExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Product with this SKU already exists'
                });
            }
        }

        await runQuery(`
            UPDATE products 
            SET sku = COALESCE($1, sku),
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                category = COALESCE($4, category),
                price_excl_vat = COALESCE($5, price_excl_vat),
                price_incl_vat = COALESCE($6, price_incl_vat),
                stock_quantity = COALESCE($7, stock_quantity),
                low_stock_threshold = COALESCE($8, low_stock_threshold),
                image_url = COALESCE($9, image_url),
                is_active = COALESCE($10, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $11
        `, [sku, name, description, category, price_excl_vat, price_incl_vat, 
            stock_quantity, low_stock_threshold, image_url, is_active, id]);

        await logActivity(req.user.id, 'update_product', `Updated product: ${name || existingProduct.name} (ID: ${id})`);

        const updatedProduct = await getQuery('SELECT * FROM products WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Product updated successfully',
            data: updatedProduct
        });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update product'
        });
    }
});

// Delete product (soft delete)
router.delete('/products/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const product = await getQuery('SELECT * FROM products WHERE id = $1', [id]);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        await runQuery('UPDATE products SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
        await logActivity(req.user.id, 'delete_product', `Deleted product: ${product.name} (ID: ${id})`);

        res.json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete product'
        });
    }
});

// Update product stock
router.patch('/products/:id/stock', [
    authenticateToken,
    body('stock_quantity').isInt({ min: 0 }).withMessage('Valid stock quantity is required'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { id } = req.params;
        const { stock_quantity } = req.body;

        const product = await getQuery('SELECT * FROM products WHERE id = $1', [id]);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        await runQuery(
            'UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [stock_quantity, id]
        );

        await logActivity(req.user.id, 'update_stock', 
            `Updated stock for ${product.name}: ${product.stock_quantity} → ${stock_quantity}`);

        const updatedProduct = await getQuery('SELECT * FROM products WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Stock updated successfully',
            data: updatedProduct
        });
    } catch (error) {
        console.error('Update stock error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update stock'
        });
    }
});

// ============================================================================
// ORDER MANAGEMENT ENDPOINTS
// ============================================================================

// Get all orders with pagination
router.get('/orders', authenticateToken, async (req, res) => {
    try {
        const { status, search } = req.query;
        const { page, limit, offset } = getPaginationParams(req.query);
        
        let sql = 'SELECT * FROM orders WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (status) {
            sql += ` AND status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (search) {
            const searchTerm = `%${sanitizeLikePattern(search)}%`;
            sql += ` AND (order_number ILIKE $${paramIndex} OR customer_name ILIKE $${paramIndex} OR customer_email ILIKE $${paramIndex})`;
            params.push(searchTerm);
            paramIndex++;
        }

        // Get total count
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const totalResult = await getQuery(countSql, params);
        const total = parseInt(totalResult.total, 10);

        // Get paginated results
        sql += ` ORDER BY placed_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        const orders = await allQuery(sql, params);

        res.json({
            success: true,
            message: 'Orders retrieved successfully',
            data: orders,
            meta: buildPaginationMeta(page, limit, total)
        });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load orders'
        });
    }
});

// Get single order with items
router.get('/orders/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const order = await getQuery('SELECT * FROM orders WHERE id = $1', [id]);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const items = await allQuery('SELECT * FROM order_items WHERE order_id = $1', [id]);

        res.json({
            success: true,
            data: {
                ...order,
                items
            }
        });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load order'
        });
    }
});

// Update order status
router.patch('/orders/:id/status', [
    authenticateToken,
    body('status').isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
        .withMessage('Invalid order status'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { id } = req.params;
        const { status } = req.body;

        const order = await getQuery('SELECT * FROM orders WHERE id = $1', [id]);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        await runQuery(
            'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [status, id]
        );

        await logActivity(req.user.id, 'update_order_status', 
            `Updated order ${order.order_number} status: ${order.status} → ${status}`);

        const updatedOrder = await getQuery('SELECT * FROM orders WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Order status updated successfully',
            data: updatedOrder
        });
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order status'
        });
    }
});

// Update order payment status
router.patch('/orders/:id/payment-status', [
    authenticateToken,
    body('payment_status').isIn(['pending', 'completed', 'failed', 'refunded'])
        .withMessage('Invalid payment status'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { id } = req.params;
        const { payment_status } = req.body;

        const order = await getQuery('SELECT * FROM orders WHERE id = $1', [id]);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        await runQuery(
            'UPDATE orders SET payment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [payment_status, id]
        );

        await logActivity(req.user.id, 'update_payment_status', 
            `Updated order ${order.order_number} payment status: ${order.payment_status} → ${payment_status}`);

        const updatedOrder = await getQuery('SELECT * FROM orders WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Payment status updated successfully',
            data: updatedOrder
        });
    } catch (error) {
        console.error('Update payment status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update payment status'
        });
    }
});

// ============================================================================
// CUSTOMER MANAGEMENT ENDPOINTS
// ============================================================================

// Get all customers with pagination
router.get('/customers', authenticateToken, async (req, res) => {
    try {
        const { search } = req.query;
        const { page, limit, offset } = getPaginationParams(req.query);
        
        let sql = 'SELECT id, email, full_name, phone, is_active, created_at FROM customers WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (search) {
            const searchTerm = `%${sanitizeLikePattern(search)}%`;
            sql += ` AND (full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
            params.push(searchTerm);
            paramIndex++;
        }

        // Get total count
        const countSql = sql.replace('SELECT id, email, full_name, phone, is_active, created_at', 'SELECT COUNT(*) as total');
        const totalResult = await getQuery(countSql, params);
        const total = parseInt(totalResult.total, 10);

        // Get paginated results
        sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        const customers = await allQuery(sql, params);

        res.json({
            success: true,
            message: 'Customers retrieved successfully',
            data: customers,
            meta: buildPaginationMeta(page, limit, total)
        });
    } catch (error) {
        console.error('Get customers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load customers'
        });
    }
});

// Get customer details with stats
router.get('/customers/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const customer = await getQuery(
            'SELECT id, email, full_name, phone, is_active, created_at FROM customers WHERE id = $1',
            [id]
        );

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        // Get customer statistics
        const stats = await getQuery(`
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total_amount), 0) as total_spent,
                COALESCE(AVG(total_amount), 0) as avg_order_value
            FROM orders
            WHERE customer_id = $1 AND payment_status = 'completed'
        `, [id]);

        res.json({
            success: true,
            data: {
                ...customer,
                stats
            }
        });
    } catch (error) {
        console.error('Get customer error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load customer'
        });
    }
});

// Update customer status (activate/deactivate)
router.patch('/customers/:id/status', [
    authenticateToken,
    body('is_active').isBoolean().withMessage('is_active must be a boolean'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { id } = req.params;
        const { is_active } = req.body;

        const customer = await getQuery('SELECT * FROM customers WHERE id = $1', [id]);
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        await runQuery('UPDATE customers SET is_active = $1 WHERE id = $2', [is_active, id]);
        await logActivity(req.user.id, 'update_customer_status', 
            `${is_active ? 'Activated' : 'Deactivated'} customer: ${customer.full_name} (${customer.email})`);

        const updatedCustomer = await getQuery(
            'SELECT id, email, full_name, phone, is_active, created_at FROM customers WHERE id = $1',
            [id]
        );

        res.json({
            success: true,
            message: `Customer ${is_active ? 'activated' : 'deactivated'} successfully`,
            data: updatedCustomer
        });
    } catch (error) {
        console.error('Update customer status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update customer status'
        });
    }
});

// Get customer order history
router.get('/customers/:id/orders', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { page, limit, offset } = getPaginationParams(req.query);

        // Check if customer exists
        const customer = await getQuery('SELECT id FROM customers WHERE id = $1', [id]);
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        // Get total count
        const totalResult = await getQuery(
            'SELECT COUNT(*) as total FROM orders WHERE customer_id = $1',
            [id]
        );
        const total = parseInt(totalResult.total, 10);

        // Get paginated orders
        const orders = await allQuery(
            'SELECT * FROM orders WHERE customer_id = $1 ORDER BY placed_at DESC LIMIT $2 OFFSET $3',
            [id, limit, offset]
        );

        res.json({
            success: true,
            message: 'Customer orders retrieved successfully',
            data: orders,
            meta: buildPaginationMeta(page, limit, total)
        });
    } catch (error) {
        console.error('Get customer orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load customer orders'
        });
    }
});

// ============================================================================
// PAYMENT MANAGEMENT ENDPOINTS
// ============================================================================

// Get payments with pagination
router.get('/payments', authenticateToken, async (req, res) => {
    try {
        const { status } = req.query;
        const { page, limit, offset } = getPaginationParams(req.query);
        
        let sql = 'SELECT * FROM payments WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (status) {
            sql += ` AND status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        // Get total count
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const totalResult = await getQuery(countSql, params);
        const total = parseInt(totalResult.total, 10);

        // Get paginated results
        sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        const payments = await allQuery(sql, params);

        res.json({
            success: true,
            message: 'Payments retrieved successfully',
            data: payments,
            meta: buildPaginationMeta(page, limit, total)
        });
    } catch (error) {
        console.error('Get payments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load payments'
        });
    }
});

// Get payment details
router.get('/payments/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const payment = await getQuery('SELECT * FROM payments WHERE id = $1', [id]);
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        // Get associated order
        const order = await getQuery('SELECT * FROM orders WHERE id = $1', [payment.order_id]);

        res.json({
            success: true,
            data: {
                ...payment,
                order
            }
        });
    } catch (error) {
        console.error('Get payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load payment'
        });
    }
});

// Update payment status
router.patch('/payments/:id/status', [
    authenticateToken,
    body('status').isIn(['pending', 'completed', 'failed', 'refunded'])
        .withMessage('Invalid payment status'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { id } = req.params;
        const { status } = req.body;

        const payment = await getQuery('SELECT * FROM payments WHERE id = $1', [id]);
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        await runQuery('UPDATE payments SET status = $1 WHERE id = $2', [status, id]);
        
        // Also update order payment status
        await runQuery('UPDATE orders SET payment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', 
            [status, payment.order_id]);

        await logActivity(req.user.id, 'update_payment_status', 
            `Updated payment ${id} status: ${payment.status} → ${status}`);

        const updatedPayment = await getQuery('SELECT * FROM payments WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Payment status updated successfully',
            data: updatedPayment
        });
    } catch (error) {
        console.error('Update payment status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update payment status'
        });
    }
});

// ============================================================================
// DISCOUNT MANAGEMENT ENDPOINTS
// ============================================================================

// Get discounts with pagination
router.get('/discounts', authenticateToken, async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query);
        
        // Get total count
        const totalResult = await getQuery('SELECT COUNT(*) as total FROM discounts');
        const total = parseInt(totalResult.total, 10);

        const discounts = await allQuery(
            'SELECT * FROM discounts ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );

        res.json({
            success: true,
            message: 'Discounts retrieved successfully',
            data: discounts,
            meta: buildPaginationMeta(page, limit, total)
        });
    } catch (error) {
        console.error('Get discounts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load discounts'
        });
    }
});

// Create discount code
router.post('/discounts', [
    authenticateToken,
    body('code').notEmpty().withMessage('Discount code is required'),
    body('discount_type').isIn(['percentage', 'fixed']).withMessage('Invalid discount type'),
    body('discount_value').isFloat({ min: 0 }).withMessage('Valid discount value is required'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { code, description, discount_type, discount_value, min_purchase_amount, 
                max_discount_amount, usage_limit, valid_from, valid_until } = req.body;

        // Check if code already exists
        const existingDiscount = await getQuery('SELECT id FROM discounts WHERE code = $1', [code]);
        if (existingDiscount) {
            return res.status(400).json({
                success: false,
                message: 'Discount code already exists'
            });
        }

        const discountId = uuidv4();
        await runQuery(`
            INSERT INTO discounts (id, code, description, discount_type, discount_value, 
                min_purchase_amount, max_discount_amount, usage_limit, valid_from, valid_until, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
        `, [discountId, code, description || null, discount_type, discount_value, 
            min_purchase_amount || null, max_discount_amount || null, usage_limit || null,
            valid_from || null, valid_until || null]);

        await logActivity(req.user.id, 'create_discount', `Created discount code: ${code}`);

        const discount = await getQuery('SELECT * FROM discounts WHERE id = $1', [discountId]);

        res.status(201).json({
            success: true,
            message: 'Discount created successfully',
            data: discount
        });
    } catch (error) {
        console.error('Create discount error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create discount'
        });
    }
});

// Update discount
router.put('/discounts/:id', [
    authenticateToken,
    body('discount_type').optional().isIn(['percentage', 'fixed']).withMessage('Invalid discount type'),
    body('discount_value').optional().isFloat({ min: 0 }).withMessage('Valid discount value is required'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { id } = req.params;
        const { code, description, discount_type, discount_value, min_purchase_amount, 
                max_discount_amount, usage_limit, valid_from, valid_until, is_active } = req.body;

        const existingDiscount = await getQuery('SELECT * FROM discounts WHERE id = $1', [id]);
        if (!existingDiscount) {
            return res.status(404).json({
                success: false,
                message: 'Discount not found'
            });
        }

        // Check if code is being changed and if new code already exists
        if (code && code !== existingDiscount.code) {
            const codeExists = await getQuery('SELECT id FROM discounts WHERE code = $1 AND id != $2', [code, id]);
            if (codeExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Discount code already exists'
                });
            }
        }

        await runQuery(`
            UPDATE discounts 
            SET code = COALESCE($1, code),
                description = COALESCE($2, description),
                discount_type = COALESCE($3, discount_type),
                discount_value = COALESCE($4, discount_value),
                min_purchase_amount = COALESCE($5, min_purchase_amount),
                max_discount_amount = COALESCE($6, max_discount_amount),
                usage_limit = COALESCE($7, usage_limit),
                valid_from = COALESCE($8, valid_from),
                valid_until = COALESCE($9, valid_until),
                is_active = COALESCE($10, is_active)
            WHERE id = $11
        `, [code, description, discount_type, discount_value, min_purchase_amount, 
            max_discount_amount, usage_limit, valid_from, valid_until, is_active, id]);

        await logActivity(req.user.id, 'update_discount', `Updated discount: ${code || existingDiscount.code}`);

        const updatedDiscount = await getQuery('SELECT * FROM discounts WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Discount updated successfully',
            data: updatedDiscount
        });
    } catch (error) {
        console.error('Update discount error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update discount'
        });
    }
});

// Delete discount (hard delete)
router.delete('/discounts/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const discount = await getQuery('SELECT * FROM discounts WHERE id = $1', [id]);
        if (!discount) {
            return res.status(404).json({
                success: false,
                message: 'Discount not found'
            });
        }

        await runQuery('DELETE FROM discounts WHERE id = $1', [id]);
        await logActivity(req.user.id, 'delete_discount', `Deleted discount: ${discount.code}`);

        res.json({
            success: true,
            message: 'Discount deleted successfully'
        });
    } catch (error) {
        console.error('Delete discount error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete discount'
        });
    }
});

// Toggle discount active status
router.patch('/discounts/:id/status', [
    authenticateToken,
    body('is_active').isBoolean().withMessage('is_active must be a boolean'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { id } = req.params;
        const { is_active } = req.body;

        const discount = await getQuery('SELECT * FROM discounts WHERE id = $1', [id]);
        if (!discount) {
            return res.status(404).json({
                success: false,
                message: 'Discount not found'
            });
        }

        await runQuery('UPDATE discounts SET is_active = $1 WHERE id = $2', [is_active, id]);
        await logActivity(req.user.id, 'update_discount_status', 
            `${is_active ? 'Activated' : 'Deactivated'} discount: ${discount.code}`);

        const updatedDiscount = await getQuery('SELECT * FROM discounts WHERE id = $1', [id]);

        res.json({
            success: true,
            message: `Discount ${is_active ? 'activated' : 'deactivated'} successfully`,
            data: updatedDiscount
        });
    } catch (error) {
        console.error('Update discount status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update discount status'
        });
    }
});

// ============================================================================
// RETURNS MANAGEMENT ENDPOINTS
// ============================================================================

// Get returns with pagination
router.get('/returns', authenticateToken, async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query);
        
        // Get total count
        const totalResult = await getQuery('SELECT COUNT(*) as total FROM returns');
        const total = parseInt(totalResult.total, 10);

        const returns = await allQuery(
            'SELECT * FROM returns ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );

        res.json({
            success: true,
            message: 'Returns retrieved successfully',
            data: returns,
            meta: buildPaginationMeta(page, limit, total)
        });
    } catch (error) {
        console.error('Get returns error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load returns'
        });
    }
});

// Get return details
router.get('/returns/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const returnRecord = await getQuery('SELECT * FROM returns WHERE id = $1', [id]);
        if (!returnRecord) {
            return res.status(404).json({
                success: false,
                message: 'Return not found'
            });
        }

        // Get associated order
        const order = await getQuery('SELECT * FROM orders WHERE id = $1', [returnRecord.order_id]);

        res.json({
            success: true,
            data: {
                ...returnRecord,
                order
            }
        });
    } catch (error) {
        console.error('Get return error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load return'
        });
    }
});

// Update return status
router.patch('/returns/:id/status', [
    authenticateToken,
    body('status').isIn(['pending', 'approved', 'rejected']).withMessage('Invalid return status'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { id } = req.params;
        const { status } = req.body;

        const returnRecord = await getQuery('SELECT * FROM returns WHERE id = $1', [id]);
        if (!returnRecord) {
            return res.status(404).json({
                success: false,
                message: 'Return not found'
            });
        }

        await runQuery(
            'UPDATE returns SET status = $1, resolved_at = CASE WHEN $1 IN (\'approved\', \'rejected\') THEN CURRENT_TIMESTAMP ELSE resolved_at END WHERE id = $2',
            [status, id]  // $1 is intentionally reused in the CASE expression
        );

        await logActivity(req.user.id, 'update_return_status', 
            `Updated return ${id} status: ${returnRecord.status} → ${status}`);

        const updatedReturn = await getQuery('SELECT * FROM returns WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Return status updated successfully',
            data: updatedReturn
        });
    } catch (error) {
        console.error('Update return status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update return status'
        });
    }
});

// Process refund for return
router.post('/returns/:id/refund', [
    authenticateToken,
    body('refund_amount').isFloat({ min: 0 }).withMessage('Valid refund amount is required'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { id } = req.params;
        const { refund_amount } = req.body;

        const returnRecord = await getQuery('SELECT * FROM returns WHERE id = $1', [id]);
        if (!returnRecord) {
            return res.status(404).json({
                success: false,
                message: 'Return not found'
            });
        }

        if (returnRecord.status !== 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Only approved returns can be refunded'
            });
        }

        // Update return with refund amount
        await runQuery(
            'UPDATE returns SET refund_amount = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2',
            [refund_amount, id]
        );

        // Update associated order payment status
        await runQuery(
            'UPDATE orders SET payment_status = \'refunded\', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [returnRecord.order_id]
        );

        // Update payment record
        await runQuery(
            'UPDATE payments SET status = \'refunded\' WHERE order_id = $1',
            [returnRecord.order_id]
        );

        await logActivity(req.user.id, 'process_refund', 
            `Processed refund of R${refund_amount} for return ${id}`);

        const updatedReturn = await getQuery('SELECT * FROM returns WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Refund processed successfully',
            data: updatedReturn
        });
    } catch (error) {
        console.error('Process refund error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process refund'
        });
    }
});

// ============================================================================
// ADMIN USER MANAGEMENT ENDPOINTS
// ============================================================================

// Get all admin users with pagination
router.get('/users', authenticateToken, async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query);
        
        // Get total count
        const totalResult = await getQuery('SELECT COUNT(*) as total FROM admins');
        const total = parseInt(totalResult.total, 10);

        const users = await allQuery(
            'SELECT id, email, full_name, is_active, created_at, last_login FROM admins ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );

        res.json({
            success: true,
            message: 'Admin users retrieved successfully',
            data: users,
            meta: buildPaginationMeta(page, limit, total)
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load admin users'
        });
    }
});

// Create new admin user
router.post('/users', [
    authenticateToken,
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('full_name').notEmpty().withMessage('Full name is required'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { email, password, full_name } = req.body;

        // Check if email already exists
        const existingUser = await getQuery('SELECT id FROM admins WHERE email = $1', [email]);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Admin with this email already exists'
            });
        }

        const userId = uuidv4();
        const password_hash = await bcrypt.hash(password, 10);

        await runQuery(
            'INSERT INTO admins (id, email, password_hash, full_name, is_active) VALUES ($1, $2, $3, $4, TRUE)',
            [userId, email, password_hash, full_name]
        );

        await logActivity(req.user.id, 'create_admin', `Created admin user: ${email}`);

        const user = await getQuery(
            'SELECT id, email, full_name, is_active, created_at FROM admins WHERE id = $1',
            [userId]
        );

        res.status(201).json({
            success: true,
            message: 'Admin user created successfully',
            data: user
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create admin user'
        });
    }
});

// Update admin user
router.put('/users/:id', [
    authenticateToken,
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { id } = req.params;
        const { email, password, full_name } = req.body;

        const existingUser = await getQuery('SELECT * FROM admins WHERE id = $1', [id]);
        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: 'Admin user not found'
            });
        }

        // Check if email is being changed and if new email already exists
        if (email && email !== existingUser.email) {
            const emailExists = await getQuery('SELECT id FROM admins WHERE email = $1 AND id != $2', [email, id]);
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Admin with this email already exists'
                });
            }
        }

        let password_hash = null;
        if (password) {
            password_hash = await bcrypt.hash(password, 10);
        }

        await runQuery(`
            UPDATE admins 
            SET email = COALESCE($1, email),
                password_hash = COALESCE($2, password_hash),
                full_name = COALESCE($3, full_name)
            WHERE id = $4
        `, [email, password_hash, full_name, id]);

        await logActivity(req.user.id, 'update_admin', `Updated admin user: ${email || existingUser.email}`);

        const updatedUser = await getQuery(
            'SELECT id, email, full_name, is_active, created_at FROM admins WHERE id = $1',
            [id]
        );

        res.json({
            success: true,
            message: 'Admin user updated successfully',
            data: updatedUser
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update admin user'
        });
    }
});

// Activate/deactivate admin user
router.patch('/users/:id/status', [
    authenticateToken,
    body('is_active').isBoolean().withMessage('is_active must be a boolean'),
], async (req, res) => {
    try {
        const validationError = handleValidationErrors(req, res);
        if (validationError) return;

        const { id } = req.params;
        const { is_active } = req.body;

        // Prevent self-deactivation
        if (id === req.user.id && !is_active) {
            return res.status(400).json({
                success: false,
                message: 'You cannot deactivate your own account'
            });
        }

        const user = await getQuery('SELECT * FROM admins WHERE id = $1', [id]);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Admin user not found'
            });
        }

        await runQuery('UPDATE admins SET is_active = $1 WHERE id = $2', [is_active, id]);
        await logActivity(req.user.id, 'update_admin_status', 
            `${is_active ? 'Activated' : 'Deactivated'} admin user: ${user.email}`);

        const updatedUser = await getQuery(
            'SELECT id, email, full_name, is_active, created_at FROM admins WHERE id = $1',
            [id]
        );

        res.json({
            success: true,
            message: `Admin user ${is_active ? 'activated' : 'deactivated'} successfully`,
            data: updatedUser
        });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update admin user status'
        });
    }
});

// ============================================================================
// REPORTS ENDPOINTS
// ============================================================================

// Sales reports with date filters
router.get('/reports/sales', authenticateToken, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        let dateFilter = '';
        const params = [];
        
        if (start_date && end_date) {
            dateFilter = 'WHERE placed_at BETWEEN $1 AND $2';
            params.push(start_date, end_date);
        } else if (start_date) {
            dateFilter = 'WHERE placed_at >= $1';
            params.push(start_date);
        } else if (end_date) {
            dateFilter = 'WHERE placed_at <= $1';
            params.push(end_date);
        }

        // Summary statistics
        const summary = await getQuery(`
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(CASE WHEN payment_status = 'completed' THEN total_amount ELSE 0 END), 0) as total_revenue,
                COALESCE(AVG(CASE WHEN payment_status = 'completed' THEN total_amount ELSE NULL END), 0) as avg_order_value,
                COUNT(DISTINCT customer_id) as unique_customers
            FROM orders
            ${dateFilter}
        `, params);

        // Orders by status
        const ordersByStatus = await allQuery(`
            SELECT status, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total_amount
            FROM orders
            ${dateFilter}
            GROUP BY status
        `, params);

        // Daily sales breakdown
        const dailySales = await allQuery(`
            SELECT 
                DATE(placed_at) as date,
                COUNT(*) as order_count,
                COALESCE(SUM(total_amount), 0) as revenue
            FROM orders
            ${dateFilter ? dateFilter + ' AND' : 'WHERE'} payment_status = 'completed'
            GROUP BY DATE(placed_at)
            ORDER BY date DESC
        `, params);

        // Top customers by revenue
        const topCustomers = await allQuery(`
            SELECT 
                customer_name,
                customer_email,
                COUNT(*) as order_count,
                COALESCE(SUM(total_amount), 0) as total_spent
            FROM orders
            ${dateFilter ? dateFilter + ' AND' : 'WHERE'} payment_status = 'completed'
            GROUP BY customer_name, customer_email
            ORDER BY total_spent DESC
            LIMIT 10
        `, params);

        res.json({
            success: true,
            data: {
                summary,
                ordersByStatus,
                dailySales,
                topCustomers
            }
        });
    } catch (error) {
        console.error('Sales report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate sales report'
        });
    }
});

// Inventory reports
router.get('/reports/inventory', authenticateToken, async (req, res) => {
    try {
        // Products by stock level
        const stockLevels = await allQuery(`
            SELECT 
                CASE 
                    WHEN stock_quantity = 0 THEN 'Out of Stock'
                    WHEN stock_quantity <= low_stock_threshold THEN 'Low Stock'
                    ELSE 'In Stock'
                END as stock_status,
                COUNT(*) as product_count,
                COALESCE(SUM(stock_quantity * price_incl_vat), 0) as inventory_value
            FROM products
            WHERE is_active = TRUE
            GROUP BY stock_status
        `);

        // Low stock products
        const lowStockProducts = await allQuery(`
            SELECT id, sku, name, category, stock_quantity, low_stock_threshold, price_incl_vat
            FROM products
            WHERE stock_quantity <= low_stock_threshold 
            AND is_active = TRUE
            ORDER BY stock_quantity ASC
            LIMIT 50
        `);

        // Products by category
        const productsByCategory = await allQuery(`
            SELECT 
                category,
                COUNT(*) as product_count,
                SUM(stock_quantity) as total_stock,
                COALESCE(SUM(stock_quantity * price_incl_vat), 0) as category_value
            FROM products
            WHERE is_active = TRUE
            GROUP BY category
            ORDER BY category_value DESC
        `);

        // Inactive products
        const inactiveCount = await getQuery(`
            SELECT COUNT(*) as count FROM products WHERE is_active = FALSE
        `);

        res.json({
            success: true,
            data: {
                stockLevels,
                lowStockProducts,
                productsByCategory,
                inactiveCount: inactiveCount.count
            }
        });
    } catch (error) {
        console.error('Inventory report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate inventory report'
        });
    }
});

// ============================================================================
// COMPLIANCE & SECURITY ENDPOINTS
// ============================================================================

// Get VAT records with pagination
router.get('/compliance/vat', authenticateToken, async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query);
        
        // Get total count
        const totalResult = await getQuery(
            'SELECT COUNT(*) as total FROM orders WHERE payment_status = \'completed\''
        );
        const total = parseInt(totalResult.total, 10);

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
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        res.json({
            success: true,
            message: 'VAT records retrieved successfully',
            data: vatRecords,
            meta: buildPaginationMeta(page, limit, total)
        });
    } catch (error) {
        console.error('Get VAT records error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load VAT records'
        });
    }
});

// Get activity logs with pagination
router.get('/compliance/activity-logs', authenticateToken, async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query);
        
        // Get total count
        const totalResult = await getQuery('SELECT COUNT(*) as total FROM activity_logs');
        const total = parseInt(totalResult.total, 10);

        const logs = await allQuery(`
            SELECT al.*, a.full_name as admin_name
            FROM activity_logs al
            LEFT JOIN admins a ON al.admin_id = a.id
            ORDER BY al.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        res.json({
            success: true,
            message: 'Activity logs retrieved successfully',
            data: logs,
            meta: buildPaginationMeta(page, limit, total)
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

// Security events with pagination
router.get('/security/events', authenticateToken, async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query);
        
        // Get total count
        const totalResult = await getQuery(
            'SELECT COUNT(*) as total FROM activity_logs WHERE action IN (\'login\', \'logout\', \'failed_login\')'
        );
        const total = parseInt(totalResult.total, 10);

        const events = await allQuery(`
            SELECT * FROM activity_logs
            WHERE action IN ('login', 'logout', 'failed_login')
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        res.json({
            success: true,
            message: 'Security events retrieved successfully',
            data: events,
            meta: buildPaginationMeta(page, limit, total)
        });
    } catch (error) {
        console.error('Get security events error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load security events'
        });
    }
});

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================

// API health check with database connection test
router.get('/health', async (req, res) => {
    try {
        // Test database connection
        const dbTest = await getQuery('SELECT 1 as test');
        const dbHealthy = dbTest && dbTest.test === 1;

        const health = {
            status: dbHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            database: {
                connected: dbHealthy,
                status: dbHealthy ? 'ok' : 'error'
            },
            uptime: process.uptime(),
            memory: process.memoryUsage()
        };

        res.status(dbHealthy ? 200 : 503).json({
            success: dbHealthy,
            data: health
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(503).json({
            success: false,
            data: {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                database: {
                    connected: false,
                    status: 'error',
                    error: error.message
                }
            }
        });
    }
});

module.exports = router;
