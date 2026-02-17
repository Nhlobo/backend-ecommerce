/**
 * PayFast Payment Controller
 * Handles PayFast payment gateway integration
 */

const crypto = require('crypto');
const { query, transaction } = require('../db/connection');

/**
 * Generate MD5 signature for PayFast
 */
const generateSignature = (data, passphrase = null) => {
    // Create parameter string
    let pfOutput = '';
    for (let key in data) {
        if (data.hasOwnProperty(key)) {
            if (data[key] !== '') {
                pfOutput += `${key}=${encodeURIComponent(data[key].toString().trim()).replace(/%20/g, '+')}&`;
            }
        }
    }

    // Remove last ampersand
    pfOutput = pfOutput.slice(0, -1);

    // Append passphrase if provided
    if (passphrase) {
        pfOutput += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
    }

    // Generate MD5 hash
    return crypto.createHash('md5').update(pfOutput).digest('hex');
};

/**
 * Create PayFast payment
 * POST /api/payments/create
 */
const createPayment = async (req, res) => {
    try {
        const { order_id } = req.body;
        const userId = req.user?.id;

        if (!order_id) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        // Get order details
        const orderResult = await query(
            `SELECT o.*, u.name, u.email 
             FROM orders o
             LEFT JOIN users u ON o.user_id = u.id
             WHERE o.id = $1`,
            [order_id]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const order = orderResult.rows[0];

        // Check if order already has a payment
        const existingPayment = await query(
            'SELECT * FROM payments WHERE order_id = $1 AND status != $2',
            [order_id, 'failed']
        );

        if (existingPayment.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Payment already exists for this order'
            });
        }

        // Generate unique payment ID
        const paymentId = `${order.order_number}_${Date.now()}`;

        // Prepare PayFast data
        const paymentData = {
            merchant_id: process.env.PAYFAST_MERCHANT_ID,
            merchant_key: process.env.PAYFAST_MERCHANT_KEY,
            return_url: `${process.env.FRONTEND_URL}/payment/success`,
            cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
            notify_url: `${process.env.BACKEND_URL}/api/payments/payfast/notify`,
            name_first: order.name || 'Customer',
            email_address: order.email || 'customer@example.com',
            m_payment_id: paymentId,
            amount: order.total.toFixed(2),
            item_name: `Order ${order.order_number}`,
            item_description: `Payment for order ${order.order_number}`
        };

        // Generate signature
        const signature = generateSignature(paymentData, process.env.PAYFAST_PASSPHRASE);
        paymentData.signature = signature;

        // Create payment record
        await query(
            `INSERT INTO payments (order_id, payfast_payment_id, amount, status, payment_method)
             VALUES ($1, $2, $3, $4, $5)`,
            [order_id, paymentId, order.total, 'pending', 'payfast']
        );

        // Update order payment status
        await query(
            'UPDATE orders SET payment_status = $1, updated_at = NOW() WHERE id = $2',
            ['pending', order_id]
        );

        res.json({
            success: true,
            message: 'Payment created successfully',
            data: {
                payfast_url: process.env.PAYFAST_URL,
                payment_data: paymentData
            }
        });

    } catch (error) {
        console.error('Create payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment'
        });
    }
};

/**
 * PayFast ITN (Instant Transaction Notification) webhook
 * POST /api/payments/payfast/notify
 */
const payfastNotify = async (req, res) => {
    try {
        const data = req.body;

        console.log('PayFast ITN received:', data);

        // Verify signature
        const signature = data.signature;
        delete data.signature;

        const calculatedSignature = generateSignature(data, process.env.PAYFAST_PASSPHRASE);

        if (signature !== calculatedSignature) {
            console.error('Invalid PayFast signature');
            return res.status(400).send('Invalid signature');
        }

        // Extract payment details
        const {
            m_payment_id,
            pf_payment_id,
            payment_status,
            amount_gross,
            amount_fee,
            amount_net
        } = data;

        // Find payment record
        const paymentResult = await query(
            'SELECT p.*, o.id as order_id FROM payments p JOIN orders o ON p.order_id = o.id WHERE p.payfast_payment_id = $1',
            [m_payment_id]
        );

        if (paymentResult.rows.length === 0) {
            console.error('Payment not found:', m_payment_id);
            return res.status(404).send('Payment not found');
        }

        const payment = paymentResult.rows[0];
        const orderId = payment.order_id;

        // Process payment based on status
        if (payment_status === 'COMPLETE') {
            await transaction(async (client) => {
                // Update payment status
                await client.query(
                    `UPDATE payments 
                     SET status = $1, transaction_id = $2, payment_method = $3, updated_at = NOW()
                     WHERE id = $4`,
                    ['completed', pf_payment_id, 'payfast', payment.id]
                );

                // Update order status
                await client.query(
                    `UPDATE orders 
                     SET status = $1, payment_status = $2, paid_at = NOW(), updated_at = NOW()
                     WHERE id = $3`,
                    ['processing', 'paid', orderId]
                );

                // Deduct inventory
                const orderItems = await client.query(
                    'SELECT variant_id, quantity FROM order_items WHERE order_id = $1',
                    [orderId]
                );

                for (const item of orderItems.rows) {
                    await client.query(
                        'UPDATE product_variants SET stock = stock - $1, updated_at = NOW() WHERE id = $2',
                        [item.quantity, item.variant_id]
                    );
                }
            });

            console.log('Payment completed successfully:', m_payment_id);
        } else {
            // Payment failed
            await query(
                `UPDATE payments 
                 SET status = $1, transaction_id = $2, updated_at = NOW()
                 WHERE id = $3`,
                ['failed', pf_payment_id, payment.id]
            );

            await query(
                `UPDATE orders 
                 SET payment_status = $1, updated_at = NOW()
                 WHERE id = $2`,
                ['failed', orderId]
            );

            console.log('Payment failed:', m_payment_id);
        }

        // Respond with OK
        res.status(200).send('OK');

    } catch (error) {
        console.error('PayFast ITN error:', error);
        res.status(500).send('Error processing notification');
    }
};

/**
 * Verify payment signature
 * POST /api/payments/verify
 */
const verifyPayment = async (req, res) => {
    try {
        const { payment_data, signature } = req.body;

        const calculatedSignature = generateSignature(payment_data, process.env.PAYFAST_PASSPHRASE);

        if (signature === calculatedSignature) {
            res.json({
                success: true,
                message: 'Signature verified successfully',
                valid: true
            });
        } else {
            res.json({
                success: true,
                message: 'Invalid signature',
                valid: false
            });
        }

    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify payment'
        });
    }
};

/**
 * Get payment status by order ID
 * GET /api/payments/:orderId
 */
const getPaymentStatus = async (req, res) => {
    try {
        const { orderId } = req.params;

        const result = await query(
            `SELECT p.*, o.order_number, o.total as order_total
             FROM payments p
             JOIN orders o ON p.order_id = o.id
             WHERE p.order_id = $1
             ORDER BY p.created_at DESC
             LIMIT 1`,
            [orderId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Get payment status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get payment status'
        });
    }
};

/**
 * Process refund (Admin only)
 * POST /api/admin/payments/:id/refund
 */
const processRefund = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, amount } = req.body;

        const paymentResult = await query(
            'SELECT * FROM payments WHERE id = $1',
            [id]
        );

        if (paymentResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        const payment = paymentResult.rows[0];

        if (payment.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Only completed payments can be refunded'
            });
        }

        const refundAmount = amount || payment.amount;

        await transaction(async (client) => {
            // Update payment status
            await client.query(
                `UPDATE payments 
                 SET status = $1, refunded_at = NOW(), updated_at = NOW()
                 WHERE id = $2`,
                ['refunded', id]
            );

            // Create refund record
            await client.query(
                `INSERT INTO refunds (order_id, payment_id, amount, refund_method, status, reason, processed_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [payment.order_id, id, refundAmount, 'payfast', 'completed', reason]
            );

            // Update order status
            await client.query(
                `UPDATE orders 
                 SET status = $1, payment_status = $2, updated_at = NOW()
                 WHERE id = $3`,
                ['cancelled', 'refunded', payment.order_id]
            );

            // Log admin action
            await client.query(
                `INSERT INTO admin_logs (admin_id, action, resource_type, resource_id, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    req.admin.id,
                    'refund_processed',
                    'payment',
                    id,
                    JSON.stringify({ amount: refundAmount, reason }),
                    req.ip
                ]
            );
        });

        res.json({
            success: true,
            message: 'Refund processed successfully'
        });

    } catch (error) {
        console.error('Process refund error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process refund'
        });
    }
};

module.exports = {
    createPayment,
    payfastNotify,
    verifyPayment,
    getPaymentStatus,
    processRefund
};
