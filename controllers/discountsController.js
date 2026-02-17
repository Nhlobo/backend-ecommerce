/**
 * Discounts Controller
 * Handles discount code management and validation
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
// PUBLIC ROUTES
// =====================================================

/**
 * Validate discount code
 * POST /api/discounts/validate
 */
const validateDiscount = async (req, res) => {
    try {
        const { code, order_total } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Discount code is required'
            });
        }

        if (!order_total || order_total <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid order total is required'
            });
        }

        // Find the discount code
        const result = await query(
            `SELECT * FROM discounts 
             WHERE code = $1 AND active = true`,
            [code.toUpperCase()]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Invalid discount code'
            });
        }

        const discount = result.rows[0];

        // Check if expired
        if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Discount code has expired'
            });
        }

        // Check minimum purchase requirement
        if (discount.min_purchase && order_total < discount.min_purchase) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase of $${discount.min_purchase} required`
            });
        }

        // Check usage limit
        if (discount.usage_limit && discount.usage_count >= discount.usage_limit) {
            return res.status(400).json({
                success: false,
                message: 'Discount code usage limit reached'
            });
        }

        // Calculate discount amount
        let discount_amount = 0;
        if (discount.type === 'percentage') {
            discount_amount = (order_total * discount.value) / 100;
        } else if (discount.type === 'fixed') {
            discount_amount = discount.value;
        }

        // Ensure discount doesn't exceed order total
        discount_amount = Math.min(discount_amount, order_total);

        res.json({
            success: true,
            data: {
                discount_id: discount.id,
                code: discount.code,
                type: discount.type,
                value: discount.value,
                discount_amount: parseFloat(discount_amount.toFixed(2)),
                final_total: parseFloat((order_total - discount_amount).toFixed(2))
            }
        });
    } catch (error) {
        console.error('Validate discount error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate discount code'
        });
    }
};

// =====================================================
// ADMIN ROUTES
// =====================================================

/**
 * Create discount code
 * POST /api/admin/discounts
 */
const createDiscount = async (req, res) => {
    try {
        if (!req.admin || !req.admin.id) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }

        const { code, type, value, min_purchase, usage_limit, expires_at, active } = req.body;

        // Validate required fields
        if (!code || !type || value === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Code, type, and value are required'
            });
        }

        // Validate type
        if (!['percentage', 'fixed'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Type must be "percentage" or "fixed"'
            });
        }

        // Validate value
        if (value <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Value must be greater than 0'
            });
        }

        if (type === 'percentage' && value > 100) {
            return res.status(400).json({
                success: false,
                message: 'Percentage value cannot exceed 100'
            });
        }

        // Check if code already exists
        const existing = await query(
            'SELECT id FROM discounts WHERE code = $1',
            [code.toUpperCase()]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Discount code already exists'
            });
        }

        // Create discount
        const result = await query(
            `INSERT INTO discounts (code, type, value, min_purchase, usage_limit, expires_at, active)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                code.toUpperCase(),
                type,
                value,
                min_purchase || null,
                usage_limit || null,
                expires_at || null,
                active !== false
            ]
        );

        const discount = result.rows[0];

        // Log admin action
        await logAdminAction(
            req.admin.id,
            'CREATE_DISCOUNT',
            'discount',
            discount.id,
            { code: discount.code, type, value },
            req.ip
        );

        res.status(201).json({
            success: true,
            data: discount
        });
    } catch (error) {
        console.error('Create discount error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create discount'
        });
    }
};

/**
 * List all discounts with pagination
 * GET /api/admin/discounts
 */
const listDiscounts = async (req, res) => {
    try {
        if (!req.admin || !req.admin.id) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }

        const {
            active,
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
        const validSortFields = ['code', 'type', 'value', 'created_at', 'expires_at'];
        const sortField = validSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Build WHERE conditions
        const conditions = [];
        const params = [];
        let paramCount = 1;

        if (active !== undefined && active !== 'all') {
            conditions.push(`active = $${paramCount}`);
            params.push(active === 'true');
            paramCount++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) FROM discounts ${whereClause}`,
            params
        );
        const totalCount = parseInt(countResult.rows[0].count);

        // Get discounts
        params.push(limitNum, offset);
        const result = await query(
            `SELECT * FROM discounts 
             ${whereClause}
             ORDER BY ${sortField} ${sortOrder}
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
        console.error('List discounts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to list discounts'
        });
    }
};

/**
 * Update discount
 * PUT /api/admin/discounts/:id
 */
const updateDiscount = async (req, res) => {
    try {
        if (!req.admin || !req.admin.id) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }

        const { id } = req.params;
        const { code, type, value, min_purchase, usage_limit, expires_at, active } = req.body;

        // Check if discount exists
        const existing = await query(
            'SELECT * FROM discounts WHERE id = $1',
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Discount not found'
            });
        }

        // Validate type if provided
        if (type && !['percentage', 'fixed'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Type must be "percentage" or "fixed"'
            });
        }

        // Validate value if provided
        if (value !== undefined) {
            if (value <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Value must be greater than 0'
                });
            }

            const discountType = type || existing.rows[0].type;
            if (discountType === 'percentage' && value > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Percentage value cannot exceed 100'
                });
            }
        }

        // Check if new code conflicts with existing
        if (code && code.toUpperCase() !== existing.rows[0].code) {
            const codeCheck = await query(
                'SELECT id FROM discounts WHERE code = $1 AND id != $2',
                [code.toUpperCase(), id]
            );

            if (codeCheck.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Discount code already exists'
                });
            }
        }

        // Build update query
        const updates = [];
        const params = [];
        let paramCount = 1;

        if (code !== undefined) {
            updates.push(`code = $${paramCount}`);
            params.push(code.toUpperCase());
            paramCount++;
        }
        if (type !== undefined) {
            updates.push(`type = $${paramCount}`);
            params.push(type);
            paramCount++;
        }
        if (value !== undefined) {
            updates.push(`value = $${paramCount}`);
            params.push(value);
            paramCount++;
        }
        if (min_purchase !== undefined) {
            updates.push(`min_purchase = $${paramCount}`);
            params.push(min_purchase);
            paramCount++;
        }
        if (usage_limit !== undefined) {
            updates.push(`usage_limit = $${paramCount}`);
            params.push(usage_limit);
            paramCount++;
        }
        if (expires_at !== undefined) {
            updates.push(`expires_at = $${paramCount}`);
            params.push(expires_at);
            paramCount++;
        }
        if (active !== undefined) {
            updates.push(`active = $${paramCount}`);
            params.push(active);
            paramCount++;
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        const result = await query(
            `UPDATE discounts 
             SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING *`,
            params
        );

        // Log admin action
        await logAdminAction(
            req.admin.id,
            'UPDATE_DISCOUNT',
            'discount',
            id,
            req.body,
            req.ip
        );

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Update discount error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update discount'
        });
    }
};

/**
 * Soft delete discount (set active=false)
 * DELETE /api/admin/discounts/:id
 */
const deleteDiscount = async (req, res) => {
    try {
        if (!req.admin || !req.admin.id) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }

        const { id } = req.params;

        // Check if discount exists
        const existing = await query(
            'SELECT * FROM discounts WHERE id = $1',
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Discount not found'
            });
        }

        // Soft delete by setting active to false
        const result = await query(
            `UPDATE discounts 
             SET active = false, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        // Log admin action
        await logAdminAction(
            req.admin.id,
            'DELETE_DISCOUNT',
            'discount',
            id,
            { code: existing.rows[0].code },
            req.ip
        );

        res.json({
            success: true,
            message: 'Discount deleted successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Delete discount error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete discount'
        });
    }
};

module.exports = {
    validateDiscount,
    createDiscount,
    listDiscounts,
    updateDiscount,
    deleteDiscount
};
