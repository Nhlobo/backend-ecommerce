const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getQuery, allQuery, runQuery } = require('../config/database');

// Create new order (public endpoint - for frontend)
router.post('/', async (req, res) => {
    try {
        const {
            customer_id,
            customer_name,
            customer_email,
            customer_phone,
            items,
            shipping_address,
            billing_address,
            payment_method
        } = req.body;

        // Validate required fields
        if (!customer_name || !customer_email || !items || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Calculate total
        let totalAmount = 0;
        const orderItems = [];

        for (const item of items) {
            const product = await getQuery(
                'SELECT * FROM products WHERE id = $1 AND is_active = TRUE',
                [item.product_id]
            );

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `Product ${item.product_id} not found`
                });
            }

            if (product.stock_quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.name}`
                });
            }

            const itemTotal = product.price_incl_vat * item.quantity;
            totalAmount += itemTotal;

            orderItems.push({
                id: uuidv4(),
                product_id: product.id,
                product_name: product.name,
                quantity: item.quantity,
                price_per_unit: product.price_incl_vat,
                total_price: itemTotal
            });
        }

        // Create order
        const orderId = uuidv4();
        const orderNumber = `ORD-${Date.now()}`;

        await runQuery(
            `INSERT INTO orders (
                id, order_number, customer_id, customer_name, customer_email, 
                customer_phone, total_amount, status, payment_status, 
                payment_method, shipping_address, billing_address
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'pending', $8, $9, $10)`,
            [
                orderId, orderNumber, customer_id || uuidv4(), customer_name,
                customer_email, customer_phone, totalAmount, payment_method,
                JSON.stringify(shipping_address), JSON.stringify(billing_address)
            ]
        );

        // Add order items
        for (const item of orderItems) {
            await runQuery(
                `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price_per_unit, total_price)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [item.id, orderId, item.product_id, item.product_name, 
                 item.quantity, item.price_per_unit, item.total_price]
            );

            // Update product stock
            await runQuery(
                'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
                [item.quantity, item.product_id]
            );
        }

        // Create payment record
        await runQuery(
            `INSERT INTO payments (id, order_id, order_number, customer_name, amount, payment_method, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
            [uuidv4(), orderId, orderNumber, customer_name, totalAmount, payment_method]
        );

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: {
                order_id: orderId,
                order_number: orderNumber,
                total_amount: totalAmount
            }
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order'
        });
    }
});

// Get order by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const order = await getQuery(
            'SELECT * FROM orders WHERE id = $1 OR order_number = $2',
            [id, id]
        );

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Get order items
        const items = await allQuery(
            'SELECT * FROM order_items WHERE order_id = $1',
            [order.id]
        );

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

module.exports = router;
