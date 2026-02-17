/**
 * Orders Controller
 * Handles order management for customers and admins
 */

const { query, transaction } = require('../db/connection');

/**
 * Generate unique order number
 * Format: ORD-YYYYMMDD-XXXX
 */
const generateOrderNumber = async () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    // Find the last order number for today
    const result = await query(
        `SELECT order_number FROM orders 
         WHERE order_number LIKE $1 
         ORDER BY order_number DESC 
         LIMIT 1`,
        [`ORD-${dateStr}-%`]
    );
    
    let sequence = 1;
    if (result.rows.length > 0) {
        const lastNumber = result.rows[0].order_number;
        const lastSequence = parseInt(lastNumber.split('-')[2]);
        sequence = lastSequence + 1;
    }
    
    const sequenceStr = String(sequence).padStart(4, '0');
    return `ORD-${dateStr}-${sequenceStr}`;
};

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
 * Create order from cart
 * POST /api/orders
 * Requires: authentication, validatedCart, validatedOrder middleware
 */
const createOrder = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!req.validatedCart || !req.validatedOrder) {
            return res.status(400).json({
                success: false,
                message: 'Cart and order validation required'
            });
        }

        const { shipping_address_id, customer_notes } = req.body;
        const userId = req.user.id;

        // Validate shipping address
        if (!shipping_address_id) {
            return res.status(400).json({
                success: false,
                message: 'Shipping address is required'
            });
        }

        // Verify shipping address belongs to user
        const addressResult = await query(
            `SELECT * FROM addresses WHERE id = $1 AND user_id = $2`,
            [shipping_address_id, userId]
        );

        if (addressResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Shipping address not found'
            });
        }

        const address = addressResult.rows[0];

        // Get user details for legacy fields
        const userResult = await query(
            `SELECT email, name FROM users WHERE id = $1`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = userResult.rows[0];

        // Create order in transaction
        const result = await transaction(async (client) => {
            // Generate order number
            const orderNumber = await generateOrderNumber();

            // Create order
            const orderResult = await client.query(
                `INSERT INTO orders (
                    user_id, order_number, status, subtotal, shipping_cost, tax, total,
                    shipping_address_id, customer_email, customer_name,
                    vat_amount, discount_amount, total_amount,
                    shipping_address_line1, shipping_address_line2, shipping_city,
                    shipping_province, shipping_postal_code, customer_notes, placed_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP
                ) RETURNING *`,
                [
                    userId,
                    orderNumber,
                    'pending',
                    req.validatedOrder.subtotal,
                    req.validatedOrder.shipping_cost,
                    req.validatedOrder.tax,
                    req.validatedOrder.total,
                    shipping_address_id,
                    user.email,
                    user.name,
                    req.validatedOrder.tax, // vat_amount (legacy)
                    req.validatedOrder.discount_amount,
                    req.validatedOrder.total, // total_amount (legacy)
                    address.line1,
                    address.line2,
                    address.city,
                    address.province,
                    address.postal_code,
                    customer_notes || null
                ]
            );

            const order = orderResult.rows[0];

            // Create order items
            const orderItems = [];
            for (const item of req.validatedOrder.items) {
                const itemResult = await client.query(
                    `INSERT INTO order_items (
                        order_id, variant_id, product_name, variant_details, quantity, price, subtotal,
                        unit_price, total_price
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING *`,
                    [
                        order.id,
                        item.variant_id,
                        item.name,
                        JSON.stringify(item.details),
                        item.quantity,
                        item.price,
                        item.subtotal,
                        item.price, // unit_price (legacy)
                        item.subtotal // total_price (legacy)
                    ]
                );
                orderItems.push(itemResult.rows[0]);
            }

            // Clear user's cart
            await client.query(
                `DELETE FROM cart_items 
                 WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)`,
                [userId]
            );

            return { order, orderItems };
        });

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: {
                order: result.order,
                items: result.orderItems
            }
        });

    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order',
            error: error.message
        });
    }
};

/**
 * Get user's orders
 * GET /api/orders
 * Requires: authentication
 */
const getUserOrders = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) as total FROM orders WHERE user_id = $1`,
            [userId]
        );
        const total = parseInt(countResult.rows[0].total);

        // Get orders with items
        const ordersResult = await query(
            `SELECT o.*, 
                    json_agg(
                        json_build_object(
                            'id', oi.id,
                            'variant_id', oi.variant_id,
                            'product_name', oi.product_name,
                            'variant_details', oi.variant_details,
                            'quantity', oi.quantity,
                            'price', oi.price,
                            'subtotal', oi.subtotal
                        )
                    ) as items
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             WHERE o.user_id = $1
             GROUP BY o.id
             ORDER BY o.created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        res.json({
            success: true,
            data: {
                orders: ordersResult.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get user orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve orders',
            error: error.message
        });
    }
};

/**
 * Get single order details
 * GET /api/orders/:id
 * Requires: authentication
 */
const getOrderById = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const orderId = req.params.id;
        const userId = req.user.id;

        // Get order with items and shipping address
        const orderResult = await query(
            `SELECT o.*, 
                    json_agg(
                        json_build_object(
                            'id', oi.id,
                            'variant_id', oi.variant_id,
                            'product_name', oi.product_name,
                            'variant_details', oi.variant_details,
                            'quantity', oi.quantity,
                            'price', oi.price,
                            'subtotal', oi.subtotal
                        )
                    ) as items,
                    json_build_object(
                        'id', a.id,
                        'line1', a.line1,
                        'line2', a.line2,
                        'city', a.city,
                        'province', a.province,
                        'postal_code', a.postal_code,
                        'country', a.country
                    ) as shipping_address
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN addresses a ON o.shipping_address_id = a.id
             WHERE o.id = $1
             GROUP BY o.id, a.id`,
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const order = orderResult.rows[0];

        // Verify order belongs to user
        if (order.user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        res.json({
            success: true,
            data: order
        });

    } catch (error) {
        console.error('Get order by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve order',
            error: error.message
        });
    }
};

// =====================================================
// ADMIN ROUTES
// =====================================================

/**
 * Get all orders (Admin)
 * GET /api/admin/orders
 * Requires: admin authentication
 */
const getAllOrders = async (req, res) => {
    try {
        const {
            status,
            payment_status,
            date_from,
            date_to,
            search,
            page = 1,
            limit = 20
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const queryParams = [];
        const conditions = [];
        let paramIndex = 1;

        // Build WHERE conditions
        if (status) {
            conditions.push(`o.status = $${paramIndex}`);
            queryParams.push(status);
            paramIndex++;
        }

        if (payment_status) {
            conditions.push(`o.payment_status = $${paramIndex}`);
            queryParams.push(payment_status);
            paramIndex++;
        }

        if (date_from) {
            conditions.push(`o.placed_at >= $${paramIndex}`);
            queryParams.push(date_from);
            paramIndex++;
        }

        if (date_to) {
            conditions.push(`o.placed_at <= $${paramIndex}`);
            queryParams.push(date_to);
            paramIndex++;
        }

        if (search) {
            conditions.push(`(o.order_number ILIKE $${paramIndex} OR o.customer_email ILIKE $${paramIndex})`);
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM orders o ${whereClause}`;
        const countResult = await query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Get orders
        queryParams.push(parseInt(limit));
        queryParams.push(offset);
        
        const ordersQuery = `
            SELECT o.*, 
                   u.email as user_email,
                   u.name as user_name,
                   (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            ${whereClause}
            ORDER BY o.placed_at DESC NULLS LAST, o.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const ordersResult = await query(ordersQuery, queryParams);

        res.json({
            success: true,
            data: {
                orders: ordersResult.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });

    } catch (error) {
        console.error('Get all orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve orders',
            error: error.message
        });
    }
};

/**
 * Update order status (Admin)
 * PUT /api/admin/orders/:id/status
 * Requires: admin authentication
 */
const updateOrderStatus = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { status } = req.body;
        const adminId = req.admin?.id || req.user?.id;
        const ipAddress = req.ip || req.connection.remoteAddress;

        // Validate status
        const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        // Get current order
        const currentOrderResult = await query(
            `SELECT * FROM orders WHERE id = $1`,
            [orderId]
        );

        if (currentOrderResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const currentOrder = currentOrderResult.rows[0];
        const oldStatus = currentOrder.status;

        // Prepare update fields
        const updateFields = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
        const updateParams = [status];
        let paramIndex = 2;

        // Set timestamps based on status
        if (status === 'shipped' && !currentOrder.shipped_at) {
            updateFields.push(`shipped_at = CURRENT_TIMESTAMP`);
        }

        if (status === 'delivered' && !currentOrder.delivered_at) {
            updateFields.push(`delivered_at = CURRENT_TIMESTAMP`);
        }

        if (status === 'cancelled' && !currentOrder.cancelled_at) {
            updateFields.push(`cancelled_at = CURRENT_TIMESTAMP`);
        }

        // Update order
        updateParams.push(orderId);
        const updateQuery = `
            UPDATE orders 
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        const result = await query(updateQuery, updateParams);
        const updatedOrder = result.rows[0];

        // Log admin action
        await logAdminAction(
            adminId,
            'update_order_status',
            'order',
            orderId,
            {
                old_status: oldStatus,
                new_status: status,
                order_number: updatedOrder.order_number
            },
            ipAddress
        );

        res.json({
            success: true,
            message: 'Order status updated successfully',
            data: updatedOrder
        });

    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order status',
            error: error.message
        });
    }
};

module.exports = {
    // Customer routes
    createOrder,
    getUserOrders,
    getOrderById,
    // Admin routes
    getAllOrders,
    updateOrderStatus
};
