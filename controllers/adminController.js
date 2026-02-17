/**
 * Admin Controller
 * Handles user management, inventory management, and logs management
 */

const { query, transaction } = require('../db/connection');

/**
 * Helper function to log admin actions
 */
const logAdminAction = async (adminId, action, resourceType, resourceId, details, ipAddress) => {
    try {
        await query(
            `INSERT INTO admin_logs (admin_id, action, resource_type, resource_id, details, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [adminId, action, resourceType, resourceId, JSON.stringify(details), ipAddress]
        );
    } catch (error) {
        console.error('Failed to log admin action:', error);
    }
};

// =====================================================
// USER MANAGEMENT
// =====================================================

/**
 * List all users/customers with pagination and search
 * GET /api/admin/customers
 */
const listCustomers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            order_by = 'created_at',
            order = 'DESC'
        } = req.query;

        // Validate pagination
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        // Validate sort field
        const validSortFields = ['name', 'email', 'created_at', 'updated_at'];
        const sortField = validSortFields.includes(order_by) ? order_by : 'created_at';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Build search conditions
        const conditions = [];
        const params = [];
        let paramCount = 1;

        if (search) {
            conditions.push(`(u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`);
            params.push(`%${search}%`);
            paramCount++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM users u ${whereClause}`,
            params
        );
        const totalCount = parseInt(countResult.rows[0].count);

        // Get users with pagination
        params.push(limitNum, offset);
        const usersResult = await query(
            `SELECT 
                u.id, 
                u.name, 
                u.email, 
                u.created_at, 
                u.updated_at,
                COUNT(DISTINCT o.id) as order_count,
                COALESCE(SUM(o.total), 0) as total_spent
             FROM users u
             LEFT JOIN orders o ON o.user_id = u.id
             ${whereClause}
             GROUP BY u.id, u.name, u.email, u.created_at, u.updated_at
             ORDER BY u.${sortField} ${sortOrder}
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            params
        );

        res.json({
            success: true,
            data: usersResult.rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                pages: Math.ceil(totalCount / limitNum)
            }
        });
    } catch (error) {
        console.error('Error listing customers:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve customers',
            error: error.message
        });
    }
};

/**
 * Update customer information
 * PUT /api/admin/customers/:id
 */
const updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email } = req.body;

        // Validate required fields
        if (!name && !email) {
            return res.status(400).json({
                success: false,
                message: 'At least one field (name or email) is required to update'
            });
        }

        // Check if customer exists
        const customerCheck = await query(
            'SELECT id, name, email FROM users WHERE id = $1',
            [id]
        );

        if (customerCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        const oldData = customerCheck.rows[0];

        // Build update query dynamically
        const updates = [];
        const params = [];
        let paramCount = 1;

        if (name) {
            updates.push(`name = $${paramCount}`);
            params.push(name);
            paramCount++;
        }

        if (email) {
            // Check if email is already taken by another user
            const emailCheck = await query(
                'SELECT id FROM users WHERE email = $1 AND id != $2',
                [email, id]
            );

            if (emailCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is already in use by another customer'
                });
            }

            updates.push(`email = $${paramCount}`);
            params.push(email);
            paramCount++;
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        // Execute update
        const result = await query(
            `UPDATE users 
             SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING id, name, email, created_at, updated_at`,
            params
        );

        // Log admin action
        await logAdminAction(
            req.user?.id,
            'update_customer',
            'customer',
            id,
            { old_data: oldData, new_data: result.rows[0] },
            req.ip
        );

        res.json({
            success: true,
            message: 'Customer updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating customer:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update customer',
            error: error.message
        });
    }
};

// =====================================================
// INVENTORY MANAGEMENT
// =====================================================

/**
 * Get low stock variants (stock <= 10)
 * GET /api/admin/inventory/low-stock
 */
const getLowStock = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            threshold = 10
        } = req.query;

        // Validate pagination
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;
        const stockThreshold = parseInt(threshold);

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) 
             FROM product_variants pv
             INNER JOIN products p ON pv.product_id = p.id
             WHERE pv.stock <= $1`,
            [stockThreshold]
        );
        const totalCount = parseInt(countResult.rows[0].count);

        // Get low stock variants with product info
        const result = await query(
            `SELECT 
                pv.id as variant_id,
                pv.sku,
                pv.texture,
                pv.length,
                pv.color,
                pv.price,
                pv.stock,
                p.id as product_id,
                p.name as product_name,
                p.description as product_description,
                p.active as product_active
             FROM product_variants pv
             INNER JOIN products p ON pv.product_id = p.id
             WHERE pv.stock <= $1
             ORDER BY pv.stock ASC, p.name ASC
             LIMIT $2 OFFSET $3`,
            [stockThreshold, limitNum, offset]
        );

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                pages: Math.ceil(totalCount / limitNum)
            },
            threshold: stockThreshold
        });
    } catch (error) {
        console.error('Error getting low stock items:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve low stock items',
            error: error.message
        });
    }
};

/**
 * Update variant stock level
 * PUT /api/admin/inventory/stock/:variantId
 */
const updateStock = async (req, res) => {
    try {
        const { variantId } = req.params;
        const { stock } = req.body;

        // Validate stock level
        if (stock === undefined || stock === null) {
            return res.status(400).json({
                success: false,
                message: 'Stock level is required'
            });
        }

        const stockLevel = parseInt(stock);
        if (isNaN(stockLevel) || stockLevel < 0) {
            return res.status(400).json({
                success: false,
                message: 'Stock level must be a non-negative integer'
            });
        }

        // Check if variant exists and get current stock
        const variantCheck = await query(
            `SELECT pv.id, pv.sku, pv.stock, p.name as product_name
             FROM product_variants pv
             INNER JOIN products p ON pv.product_id = p.id
             WHERE pv.id = $1`,
            [variantId]
        );

        if (variantCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product variant not found'
            });
        }

        const oldStock = variantCheck.rows[0].stock;

        // Update stock
        const result = await query(
            `UPDATE product_variants 
             SET stock = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING id, sku, stock, updated_at`,
            [stockLevel, variantId]
        );

        // Log admin action
        await logAdminAction(
            req.user?.id,
            'update_stock',
            'variant',
            variantId,
            { 
                sku: variantCheck.rows[0].sku,
                product_name: variantCheck.rows[0].product_name,
                old_stock: oldStock, 
                new_stock: stockLevel 
            },
            req.ip
        );

        res.json({
            success: true,
            message: 'Stock updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating stock:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update stock',
            error: error.message
        });
    }
};

// =====================================================
// LOGS MANAGEMENT
// =====================================================

/**
 * Get admin activity logs with filters
 * GET /api/admin/logs/admin
 */
const getAdminLogs = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            admin_id,
            action,
            date_from,
            date_to,
            resource_type
        } = req.query;

        // Validate pagination
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        // Build filter conditions
        const conditions = [];
        const params = [];
        let paramCount = 1;

        if (admin_id) {
            conditions.push(`al.admin_id = $${paramCount}`);
            params.push(admin_id);
            paramCount++;
        }

        if (action) {
            conditions.push(`al.action = $${paramCount}`);
            params.push(action);
            paramCount++;
        }

        if (resource_type) {
            conditions.push(`al.resource_type = $${paramCount}`);
            params.push(resource_type);
            paramCount++;
        }

        if (date_from) {
            conditions.push(`al.created_at >= $${paramCount}`);
            params.push(date_from);
            paramCount++;
        }

        if (date_to) {
            conditions.push(`al.created_at <= $${paramCount}`);
            params.push(date_to);
            paramCount++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM admin_logs al ${whereClause}`,
            params
        );
        const totalCount = parseInt(countResult.rows[0].count);

        // Get logs with admin info
        params.push(limitNum, offset);
        const logsResult = await query(
            `SELECT 
                al.id,
                al.admin_id,
                a.username as admin_username,
                al.action,
                al.resource_type,
                al.resource_id,
                al.details,
                al.ip_address,
                al.created_at
             FROM admin_logs al
             LEFT JOIN admins a ON al.admin_id = a.id
             ${whereClause}
             ORDER BY al.created_at DESC
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            params
        );

        res.json({
            success: true,
            data: logsResult.rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                pages: Math.ceil(totalCount / limitNum)
            },
            filters: {
                admin_id,
                action,
                resource_type,
                date_from,
                date_to
            }
        });
    } catch (error) {
        console.error('Error getting admin logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve admin logs',
            error: error.message
        });
    }
};

/**
 * Get security event logs with filters
 * GET /api/admin/logs/security
 */
const getSecurityLogs = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            user_type,
            event_type,
            severity,
            date_from,
            date_to
        } = req.query;

        // Validate pagination
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        // Build filter conditions
        const conditions = [];
        const params = [];
        let paramCount = 1;

        if (user_type) {
            conditions.push(`sl.user_type = $${paramCount}`);
            params.push(user_type);
            paramCount++;
        }

        if (event_type) {
            conditions.push(`sl.event_type = $${paramCount}`);
            params.push(event_type);
            paramCount++;
        }

        if (severity) {
            conditions.push(`sl.severity = $${paramCount}`);
            params.push(severity);
            paramCount++;
        }

        if (date_from) {
            conditions.push(`sl.created_at >= $${paramCount}`);
            params.push(date_from);
            paramCount++;
        }

        if (date_to) {
            conditions.push(`sl.created_at <= $${paramCount}`);
            params.push(date_to);
            paramCount++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM security_logs sl ${whereClause}`,
            params
        );
        const totalCount = parseInt(countResult.rows[0].count);

        // Get security logs
        params.push(limitNum, offset);
        const logsResult = await query(
            `SELECT 
                sl.id,
                sl.user_type,
                sl.user_id,
                sl.event_type,
                sl.severity,
                sl.ip_address,
                sl.user_agent,
                sl.details,
                sl.created_at
             FROM security_logs sl
             ${whereClause}
             ORDER BY sl.created_at DESC
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            params
        );

        res.json({
            success: true,
            data: logsResult.rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                pages: Math.ceil(totalCount / limitNum)
            },
            filters: {
                user_type,
                event_type,
                severity,
                date_from,
                date_to
            }
        });
    } catch (error) {
        console.error('Error getting security logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve security logs',
            error: error.message
        });
    }
};

module.exports = {
    listCustomers,
    updateCustomer,
    getLowStock,
    updateStock,
    getAdminLogs,
    getSecurityLogs
};
