/**
 * Admin Routes
 * All protected admin dashboard routes
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { logActivity, logDataAccess } = require('../middleware/logger');
const { validateUUID, validatePagination, validateProduct, validateOrderUpdate, validateDiscountCode } = require('../middleware/validator');

// =====================================================
// DASHBOARD OVERVIEW
// =====================================================

/**
 * Get dashboard overview statistics
 */
router.get('/dashboard/overview', async (req, res) => {
    try {
        // Get today's stats
        const today = new Date().toISOString().split('T')[0];
        
        // Total orders today
        const ordersToday = await query(
            `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
             FROM orders WHERE DATE(placed_at) = $1`,
            [today]
        );
        
        // Pending orders
        const pendingOrders = await query(
            `SELECT COUNT(*) as count FROM orders WHERE status = 'pending'`
        );
        
        // Low stock products
        const lowStock = await query(
            `SELECT COUNT(*) as count FROM products 
             WHERE stock_quantity <= low_stock_threshold AND is_active = true`
        );
        
        // Recent transactions
        const recentTransactions = await query(
            `SELECT o.id, o.order_number, o.customer_name, o.total_amount, o.status, o.placed_at
             FROM orders o
             ORDER BY o.placed_at DESC
             LIMIT 10`
        );
        
        // This week's revenue
        const weekRevenue = await query(
            `SELECT COALESCE(SUM(total_amount), 0) as revenue
             FROM orders 
             WHERE placed_at >= DATE_TRUNC('week', CURRENT_DATE)
             AND payment_status = 'paid'`
        );
        
        res.json({
            success: true,
            data: {
                ordersToday: {
                    count: parseInt(ordersToday.rows[0].count),
                    revenue: parseFloat(ordersToday.rows[0].revenue)
                },
                pendingOrders: parseInt(pendingOrders.rows[0].count),
                lowStockProducts: parseInt(lowStock.rows[0].count),
                weekRevenue: parseFloat(weekRevenue.rows[0].revenue),
                recentTransactions: recentTransactions.rows
            }
        });
    } catch (error) {
        console.error('Dashboard overview error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard overview'
        });
    }
});

// =====================================================
// ORDERS MANAGEMENT
// =====================================================

/**
 * Get all orders with filtering
 */
router.get('/orders', validatePagination, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, payment_status, search } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        let paramCount = 1;
        
        if (status) {
            whereClause += ` AND status = $${paramCount++}`;
            params.push(status);
        }
        
        if (payment_status) {
            whereClause += ` AND payment_status = $${paramCount++}`;
            params.push(payment_status);
        }
        
        if (search) {
            whereClause += ` AND (order_number ILIKE $${paramCount++} OR customer_name ILIKE $${paramCount++} OR customer_email ILIKE $${paramCount++})`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
            paramCount += 2;
        }
        
        const ordersQuery = `
            SELECT * FROM orders 
            WHERE ${whereClause}
            ORDER BY placed_at DESC
            LIMIT $${paramCount++} OFFSET $${paramCount}
        `;
        params.push(limit, offset);
        
        const orders = await query(ordersQuery, params);
        
        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM orders WHERE ${whereClause}`;
        const countResult = await query(countQuery, params.slice(0, -2));
        
        res.json({
            success: true,
            data: orders.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].total)
            }
        });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders'
        });
    }
});

/**
 * Get order by ID with items
 */
router.get('/orders/:id', validateUUID('id'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const orderResult = await query(
            'SELECT * FROM orders WHERE id = $1',
            [id]
        );
        
        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        // Get order items
        const itemsResult = await query(
            'SELECT * FROM order_items WHERE order_id = $1',
            [id]
        );
        
        // Get payment info
        const paymentResult = await query(
            'SELECT * FROM payments WHERE order_id = $1',
            [id]
        );
        
        res.json({
            success: true,
            data: {
                ...orderResult.rows[0],
                items: itemsResult.rows,
                payment: paymentResult.rows[0] || null
            }
        });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order'
        });
    }
});

/**
 * Update order
 */
router.put('/orders/:id', validateUUID('id'), validateOrderUpdate, logActivity('update_order', 'order', 'info'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        const fields = [];
        const values = [];
        let paramCount = 1;
        
        Object.keys(updates).forEach(key => {
            fields.push(`${key} = $${paramCount++}`);
            values.push(updates[key]);
        });
        
        fields.push(`updated_at = NOW()`);
        values.push(id);
        
        const updateQuery = `
            UPDATE orders 
            SET ${fields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;
        
        const result = await query(updateQuery, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Order updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order'
        });
    }
});

// =====================================================
// PAYMENTS MANAGEMENT
// =====================================================

/**
 * Get all payments with filtering
 */
router.get('/payments', validatePagination, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, payment_method } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        let paramCount = 1;
        
        if (status) {
            whereClause += ` AND status = $${paramCount++}`;
            params.push(status);
        }
        
        if (payment_method) {
            whereClause += ` AND payment_method = $${paramCount++}`;
            params.push(payment_method);
        }
        
        const paymentsQuery = `
            SELECT p.*, o.order_number, o.customer_name 
            FROM payments p
            JOIN orders o ON p.order_id = o.id
            WHERE ${whereClause}
            ORDER BY p.created_at DESC
            LIMIT $${paramCount++} OFFSET $${paramCount}
        `;
        params.push(limit, offset);
        
        const payments = await query(paymentsQuery, params);
        
        res.json({
            success: true,
            data: payments.rows
        });
    } catch (error) {
        console.error('Get payments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payments'
        });
    }
});

// =====================================================
// CUSTOMERS MANAGEMENT
// =====================================================

/**
 * Get all customers
 */
router.get('/customers', validatePagination, logDataAccess('customer_list', 'view'), async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        let paramCount = 1;
        
        if (search) {
            whereClause += ` AND (full_name ILIKE $${paramCount++} OR email ILIKE $${paramCount++})`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern);
            paramCount++;
        }
        
        const customersQuery = `
            SELECT id, email, full_name, phone, is_active, email_verified, created_at
            FROM customers 
            WHERE ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramCount++} OFFSET $${paramCount}
        `;
        params.push(limit, offset);
        
        const customers = await query(customersQuery, params);
        
        res.json({
            success: true,
            data: customers.rows
        });
    } catch (error) {
        console.error('Get customers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch customers'
        });
    }
});

/**
 * Get customer by ID with order history
 */
router.get('/customers/:id', validateUUID('id'), logDataAccess('customer_profile', 'view'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const customerResult = await query(
            'SELECT id, email, full_name, phone, is_active, email_verified, created_at FROM customers WHERE id = $1',
            [id]
        );
        
        if (customerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }
        
        // Get order history
        const ordersResult = await query(
            'SELECT * FROM orders WHERE customer_id = $1 ORDER BY placed_at DESC LIMIT 10',
            [id]
        );
        
        // Get addresses
        const addressesResult = await query(
            'SELECT * FROM customer_addresses WHERE customer_id = $1',
            [id]
        );
        
        res.json({
            success: true,
            data: {
                ...customerResult.rows[0],
                orders: ordersResult.rows,
                addresses: addressesResult.rows
            }
        });
    } catch (error) {
        console.error('Get customer error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch customer'
        });
    }
});

// =====================================================
// PRODUCTS & INVENTORY MANAGEMENT
// =====================================================

/**
 * Get all products
 */
router.get('/products', validatePagination, async (req, res) => {
    try {
        const { page = 1, limit = 20, category, search, low_stock } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        let paramCount = 1;
        
        if (category) {
            whereClause += ` AND category = $${paramCount++}`;
            params.push(category);
        }
        
        if (search) {
            whereClause += ` AND (name ILIKE $${paramCount++} OR sku ILIKE $${paramCount++})`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern);
            paramCount++;
        }
        
        if (low_stock === 'true') {
            whereClause += ` AND stock_quantity <= low_stock_threshold`;
        }
        
        const productsQuery = `
            SELECT * FROM products 
            WHERE ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramCount++} OFFSET $${paramCount}
        `;
        params.push(limit, offset);
        
        const products = await query(productsQuery, params);
        
        res.json({
            success: true,
            data: products.rows
        });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
});

/**
 * Create product
 */
router.post('/products', validateProduct, logActivity('create_product', 'product', 'info'), async (req, res) => {
    try {
        const { name, description, category, base_price, stock_quantity, sku, low_stock_threshold = 10 } = req.body;
        
        // Calculate VAT-inclusive price
        const vatRate = parseFloat(process.env.VAT_RATE) || 0.15;
        const price_incl_vat = base_price * (1 + vatRate);
        
        const result = await query(
            `INSERT INTO products 
             (name, description, category, base_price, price_incl_vat, stock_quantity, sku, low_stock_threshold)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [name, description, category, base_price, price_incl_vat, stock_quantity, sku, low_stock_threshold]
        );
        
        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: result.rows[0]
        });
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            return res.status(400).json({
                success: false,
                message: 'Product SKU already exists'
            });
        }
        console.error('Create product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create product'
        });
    }
});

/**
 * Update product
 */
router.put('/products/:id', validateUUID('id'), logActivity('update_product', 'product', 'info'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Recalculate VAT if base_price changed
        if (updates.base_price) {
            const vatRate = parseFloat(process.env.VAT_RATE) || 0.15;
            updates.price_incl_vat = updates.base_price * (1 + vatRate);
        }
        
        const fields = [];
        const values = [];
        let paramCount = 1;
        
        Object.keys(updates).forEach(key => {
            fields.push(`${key} = $${paramCount++}`);
            values.push(updates[key]);
        });
        
        fields.push(`updated_at = NOW()`);
        values.push(id);
        
        const updateQuery = `
            UPDATE products 
            SET ${fields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;
        
        const result = await query(updateQuery, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Product updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update product'
        });
    }
});

/**
 * Delete product
 */
router.delete('/products/:id', validateUUID('id'), logActivity('delete_product', 'product', 'warning'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await query(
            'DELETE FROM products WHERE id = $1 RETURNING id',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
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

// =====================================================
// DISCOUNTS & PROMOTIONS
// =====================================================

/**
 * Get all discount codes
 */
router.get('/discounts', async (req, res) => {
    try {
        const result = await query(
            'SELECT * FROM discount_codes ORDER BY created_at DESC'
        );
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get discounts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch discounts'
        });
    }
});

/**
 * Create discount code
 */
router.post('/discounts', validateDiscountCode, logActivity('create_discount', 'discount', 'info'), async (req, res) => {
    try {
        const { code, description, discount_type, discount_value, min_order_value, max_discount_amount, usage_limit, starts_at, expires_at } = req.body;
        
        const result = await query(
            `INSERT INTO discount_codes 
             (code, description, discount_type, discount_value, min_order_value, max_discount_amount, usage_limit, starts_at, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [code, description, discount_type, discount_value, min_order_value || 0, max_discount_amount, usage_limit, starts_at, expires_at]
        );
        
        res.status(201).json({
            success: true,
            message: 'Discount code created successfully',
            data: result.rows[0]
        });
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            return res.status(400).json({
                success: false,
                message: 'Discount code already exists'
            });
        }
        console.error('Create discount error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create discount code'
        });
    }
});

// =====================================================
// RETURNS & REFUNDS
// =====================================================

/**
 * Get all returns
 */
router.get('/returns', validatePagination, async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        let paramCount = 1;
        
        if (status) {
            whereClause += ` AND status = $${paramCount++}`;
            params.push(status);
        }
        
        const returnsQuery = `
            SELECT r.*, o.order_number, c.full_name as customer_name
            FROM returns r
            JOIN orders o ON r.order_id = o.id
            LEFT JOIN customers c ON r.customer_id = c.id
            WHERE ${whereClause}
            ORDER BY r.requested_at DESC
            LIMIT $${paramCount++} OFFSET $${paramCount}
        `;
        params.push(limit, offset);
        
        const returns = await query(returnsQuery, params);
        
        res.json({
            success: true,
            data: returns.rows
        });
    } catch (error) {
        console.error('Get returns error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch returns'
        });
    }
});

/**
 * Update return status
 */
router.put('/returns/:id', validateUUID('id'), logActivity('update_return', 'return', 'info'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, inspection_notes, inspection_result, refund_amount } = req.body;
        
        const result = await query(
            `UPDATE returns 
             SET status = COALESCE($1, status),
                 inspection_notes = COALESCE($2, inspection_notes),
                 inspection_result = COALESCE($3, inspection_result),
                 refund_amount = COALESCE($4, refund_amount),
                 updated_at = NOW()
             WHERE id = $5
             RETURNING *`,
            [status, inspection_notes, inspection_result, refund_amount, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Return not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Return updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Update return error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update return'
        });
    }
});

/**
 * Get all refunds
 */
router.get('/refunds', validatePagination, async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        let paramCount = 1;
        
        if (status) {
            whereClause += ` AND status = $${paramCount++}`;
            params.push(status);
        }
        
        const refundsQuery = `
            SELECT rf.*, o.order_number
            FROM refunds rf
            JOIN orders o ON rf.order_id = o.id
            WHERE ${whereClause}
            ORDER BY rf.created_at DESC
            LIMIT $${paramCount++} OFFSET $${paramCount}
        `;
        params.push(limit, offset);
        
        const refunds = await query(refundsQuery, params);
        
        res.json({
            success: true,
            data: refunds.rows
        });
    } catch (error) {
        console.error('Get refunds error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch refunds'
        });
    }
});

// =====================================================
// REPORTS & ANALYTICS
// =====================================================

/**
 * Get sales report
 */
router.get('/reports/sales', async (req, res) => {
    try {
        const { start_date, end_date, period = 'day' } = req.query;
        
        const groupBy = period === 'month' ? "DATE_TRUNC('month', placed_at)" : "DATE(placed_at)";
        
        const salesQuery = `
            SELECT 
                ${groupBy} as period,
                COUNT(*) as total_orders,
                SUM(total_amount) as total_revenue,
                SUM(vat_amount) as total_vat,
                AVG(total_amount) as average_order_value
            FROM orders
            WHERE payment_status = 'paid'
            ${start_date ? `AND placed_at >= $1` : ''}
            ${end_date ? `AND placed_at <= $${start_date ? 2 : 1}` : ''}
            GROUP BY period
            ORDER BY period DESC
        `;
        
        const params = [];
        if (start_date) params.push(start_date);
        if (end_date) params.push(end_date);
        
        const result = await query(salesQuery, params);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get sales report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sales report'
        });
    }
});

/**
 * Get product performance
 */
router.get('/reports/products', async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                p.id,
                p.name,
                p.category,
                p.stock_quantity,
                COUNT(oi.id) as times_ordered,
                SUM(oi.quantity) as units_sold,
                SUM(oi.total_price) as revenue
            FROM products p
            LEFT JOIN order_items oi ON p.id = oi.product_id
            GROUP BY p.id
            ORDER BY revenue DESC NULLS LAST
            LIMIT 50
        `);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get product performance error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product performance'
        });
    }
});

// =====================================================
// COMPLIANCE & LEGAL
// =====================================================

/**
 * Get VAT records
 */
router.get('/compliance/vat', validatePagination, async (req, res) => {
    try {
        const { page = 1, limit = 20, start_date, end_date } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        let paramCount = 1;
        
        if (start_date) {
            whereClause += ` AND invoice_date >= $${paramCount++}`;
            params.push(start_date);
        }
        
        if (end_date) {
            whereClause += ` AND invoice_date <= $${paramCount++}`;
            params.push(end_date);
        }
        
        const vatQuery = `
            SELECT v.*, o.order_number
            FROM vat_records v
            LEFT JOIN orders o ON v.order_id = o.id
            WHERE ${whereClause}
            ORDER BY invoice_date DESC
            LIMIT $${paramCount++} OFFSET $${paramCount}
        `;
        params.push(limit, offset);
        
        const result = await query(vatQuery, params);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get VAT records error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch VAT records'
        });
    }
});

/**
 * Get policy documents
 */
router.get('/compliance/policies', async (req, res) => {
    try {
        const result = await query(
            'SELECT * FROM policy_documents ORDER BY created_at DESC'
        );
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get policies error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch policy documents'
        });
    }
});

// =====================================================
// SECURITY & ACTIVITY LOGS
// =====================================================

/**
 * Get activity logs
 */
router.get('/logs/activity', validatePagination, async (req, res) => {
    try {
        const { page = 1, limit = 50, severity, action } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        let paramCount = 1;
        
        if (severity) {
            whereClause += ` AND severity = $${paramCount++}`;
            params.push(severity);
        }
        
        if (action) {
            whereClause += ` AND action ILIKE $${paramCount++}`;
            params.push(`%${action}%`);
        }
        
        const logsQuery = `
            SELECT l.*, u.email as admin_email, u.full_name as admin_name
            FROM activity_logs l
            JOIN admin_users u ON l.admin_id = u.id
            WHERE ${whereClause}
            ORDER BY l.created_at DESC
            LIMIT $${paramCount++} OFFSET $${paramCount}
        `;
        params.push(limit, offset);
        
        const result = await query(logsQuery, params);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get activity logs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch activity logs'
        });
    }
});

/**
 * Get security events
 */
router.get('/logs/security', validatePagination, async (req, res) => {
    try {
        const { page = 1, limit = 50, severity, resolved } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        const params = [];
        let paramCount = 1;
        
        if (severity) {
            whereClause += ` AND severity = $${paramCount++}`;
            params.push(severity);
        }
        
        if (resolved !== undefined) {
            whereClause += ` AND resolved = $${paramCount++}`;
            params.push(resolved === 'true');
        }
        
        const eventsQuery = `
            SELECT * FROM security_events
            WHERE ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramCount++} OFFSET $${paramCount}
        `;
        params.push(limit, offset);
        
        const result = await query(eventsQuery, params);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get security events error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch security events'
        });
    }
});

module.exports = router;
