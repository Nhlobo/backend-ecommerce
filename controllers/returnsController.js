/**
 * Returns Controller
 * Handles product return requests and management
 */

const { query } = require('../db/connection');

/**
 * Log admin action
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
// CUSTOMER ROUTES
// =====================================================

/**
 * Create return request
 * POST /api/returns
 */
const createReturn = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const { order_id, reason, items } = req.body;

        // Validate required fields
        if (!order_id || !reason) {
            return res.status(400).json({
                success: false,
                message: 'Order ID and reason are required'
            });
        }

        // Verify order exists and belongs to user
        const orderResult = await query(
            `SELECT id, user_id, status, total_amount 
             FROM orders 
             WHERE id = $1 AND user_id = $2`,
            [order_id, req.user.id]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const order = orderResult.rows[0];

        // Check if order is in a returnable state
        if (!['delivered', 'completed'].includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: 'Only delivered or completed orders can be returned'
            });
        }

        // Check if return already exists for this order
        const existingReturn = await query(
            `SELECT id FROM returns WHERE order_id = $1 AND status NOT IN ('rejected', 'refunded')`,
            [order_id]
        );

        if (existingReturn.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'A return request already exists for this order'
            });
        }

        // Create return request
        const result = await query(
            `INSERT INTO returns (order_id, user_id, reason, items, status)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [order_id, req.user.id, reason, JSON.stringify(items || []), 'requested']
        );

        res.status(201).json({
            success: true,
            data: result.rows[0],
            message: 'Return request created successfully'
        });
    } catch (error) {
        console.error('Create return error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create return request'
        });
    }
};

/**
 * Get user's returns
 * GET /api/returns
 */
const getUserReturns = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const { status, page = 1, limit = 20 } = req.query;

        // Validate pagination
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        // Build WHERE conditions
        const conditions = ['r.user_id = $1'];
        const params = [req.user.id];
        let paramCount = 2;

        if (status) {
            conditions.push(`r.status = $${paramCount}`);
            params.push(status);
            paramCount++;
        }

        const whereClause = conditions.join(' AND ');

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM returns r WHERE ${whereClause}`,
            params
        );
        const totalCount = parseInt(countResult.rows[0].count);

        // Get returns with order details
        params.push(limitNum, offset);
        const result = await query(
            `SELECT r.*, 
                    o.order_number, o.total_amount, o.status as order_status,
                    o.created_at as order_date
             FROM returns r
             JOIN orders o ON r.order_id = o.id
             WHERE ${whereClause}
             ORDER BY r.created_at DESC
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            params
        );

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                pages: Math.ceil(totalCount / limitNum)
            }
        });
    } catch (error) {
        console.error('Get user returns error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve returns'
        });
    }
};

// =====================================================
// ADMIN ROUTES
// =====================================================

/**
 * List all returns with filters
 * GET /api/admin/returns
 */
const listAllReturns = async (req, res) => {
    try {
        if (!req.admin || !req.admin.id) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }

        const {
            status,
            user_id,
            date_from,
            date_to,
            page = 1,
            limit = 20,
            sort = 'created_at',
            order = 'DESC'
        } = req.query;

        // Validate pagination
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        // Validate sort field
        const validSortFields = ['created_at', 'updated_at', 'status', 'refund_amount'];
        const sortField = validSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Build WHERE conditions
        const conditions = [];
        const params = [];
        let paramCount = 1;

        if (status) {
            conditions.push(`r.status = $${paramCount}`);
            params.push(status);
            paramCount++;
        }

        if (user_id) {
            conditions.push(`r.user_id = $${paramCount}`);
            params.push(user_id);
            paramCount++;
        }

        if (date_from) {
            conditions.push(`r.created_at >= $${paramCount}`);
            params.push(date_from);
            paramCount++;
        }

        if (date_to) {
            conditions.push(`r.created_at <= $${paramCount}`);
            params.push(date_to);
            paramCount++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM returns r ${whereClause}`,
            params
        );
        const totalCount = parseInt(countResult.rows[0].count);

        // Get returns with user and order details
        params.push(limitNum, offset);
        const result = await query(
            `SELECT r.*, 
                    o.order_number, o.total_amount, o.status as order_status,
                    u.email as user_email, u.name as user_name
             FROM returns r
             JOIN orders o ON r.order_id = o.id
             JOIN users u ON r.user_id = u.id
             ${whereClause}
             ORDER BY r.${sortField} ${sortOrder}
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            params
        );

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                pages: Math.ceil(totalCount / limitNum)
            }
        });
    } catch (error) {
        console.error('List all returns error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to list returns'
        });
    }
};

/**
 * Update return status
 * PUT /api/admin/returns/:id
 */
const updateReturnStatus = async (req, res) => {
    try {
        if (!req.admin || !req.admin.id) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }

        const { id } = req.params;
        const { status, refund_amount, admin_notes } = req.body;

        // Validate status
        const validStatuses = ['requested', 'approved', 'rejected', 'refunded'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${validStatuses.join(', ')}`
            });
        }

        // Check if return exists
        const existing = await query(
            `SELECT r.*, o.total_amount as order_total
             FROM returns r
             JOIN orders o ON r.order_id = o.id
             WHERE r.id = $1`,
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Return not found'
            });
        }

        const returnRequest = existing.rows[0];

        // Validate refund amount if status is refunded
        if (status === 'refunded') {
            if (!refund_amount || refund_amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid refund amount is required for refunded status'
                });
            }

            if (refund_amount > returnRequest.order_total) {
                return res.status(400).json({
                    success: false,
                    message: 'Refund amount cannot exceed order total'
                });
            }
        }

        // Build update query
        const updates = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
        const params = [status];
        let paramCount = 2;

        if (refund_amount !== undefined) {
            updates.push(`refund_amount = $${paramCount}`);
            params.push(refund_amount);
            paramCount++;
        }

        if (admin_notes !== undefined) {
            updates.push(`admin_notes = $${paramCount}`);
            params.push(admin_notes);
            paramCount++;
        }

        params.push(id);

        const result = await query(
            `UPDATE returns 
             SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING *`,
            params
        );

        // Log admin action
        await logAdminAction(
            req.admin.id,
            'UPDATE_RETURN_STATUS',
            'return',
            id,
            { status, refund_amount, admin_notes },
            req.ip
        );

        res.json({
            success: true,
            data: result.rows[0],
            message: 'Return status updated successfully'
        });
    } catch (error) {
        console.error('Update return status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update return status'
        });
    }
};

module.exports = {
    createReturn,
    getUserReturns,
    listAllReturns,
    updateReturnStatus
};
