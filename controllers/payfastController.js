/**
 * PayFast Payment Controller
 * Handles PayFast payment gateway integration with enhanced security
 */

const crypto = require('crypto');
const { query, transaction } = require('../db/connection');
const payfastService = require('../services/payfastService');

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

        // Check if order already has a completed payment
        const existingPayment = await query(
            'SELECT * FROM payments WHERE order_id = $1 AND status = $2',
            [order_id, 'completed']
        );

        if (existingPayment.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Payment already completed for this order'
            });
        }

        // Generate payment data using service
        const paymentData = payfastService.generatePaymentData(order);

        // Create or update payment record
        await query(
            `INSERT INTO payments (order_id, amount, status, payment_method)
             VALUES ($1, $2, 'pending', 'payfast')
             ON CONFLICT (order_id) 
             DO UPDATE SET status = 'pending', updated_at = CURRENT_TIMESTAMP`,
            [order_id, order.total]
        );

        // Update order payment status
        await query(
            'UPDATE orders SET payment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['pending', order_id]
        );

        res.json({
            success: true,
            message: 'Payment created successfully',
            data: {
                payfast_url: payfastService.getPaymentUrl(),
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
        
        // Get source IP for validation
        const sourceIp = req.headers['x-forwarded-for'] 
            ? req.headers['x-forwarded-for'].split(',')[0].trim()
            : req.connection.remoteAddress || req.socket.remoteAddress;

        console.log('PayFast ITN received from IP:', sourceIp);
        console.log('PayFast ITN data:', data);

        // Verify ITN with enhanced security
        const verification = await payfastService.verifyITN(data, sourceIp);

        if (!verification.valid) {
            console.error('PayFast ITN verification failed:', verification.errors);
            return res.status(400).send('Verification failed');
        }

        // Log any warnings
        if (verification.warnings.length > 0) {
            console.warn('PayFast ITN warnings:', verification.warnings);
        }

        // Extract payment details
        const {
            m_payment_id,
            pf_payment_id,
            payment_status,
            amount_gross,
            amount_fee,
            amount_net,
            custom_str1 // order_id
        } = data;

        const orderId = custom_str1;

        // Check for duplicate processing (idempotency)
        const existingPayment = await query(
            `SELECT id, status FROM payments 
             WHERE order_id = $1 AND payfast_payment_id = $2`,
            [orderId, pf_payment_id]
        );

        if (existingPayment.rows.length > 0 && existingPayment.rows[0].status === 'completed') {
            console.log('Payment already processed (idempotency check):', pf_payment_id);
            return res.status(200).send('OK');
        }

        // Process payment based on status
        if (payment_status === 'COMPLETE') {
            await transaction(async (client) => {
                // Update payment status
                await client.query(
                    `UPDATE payments 
                     SET status = 'completed', 
                         payfast_payment_id = $1,
                         transaction_id = $2, 
                         payment_method = 'payfast',
                         updated_at = CURRENT_TIMESTAMP
                     WHERE order_id = $3 AND status = 'pending'`,
                    [pf_payment_id, m_payment_id, orderId]
                );

                // Update order status
                await client.query(
                    `UPDATE orders 
                     SET status = 'processing', 
                         payment_status = 'paid', 
                         paid_at = CURRENT_TIMESTAMP,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [orderId]
                );

                // Inventory should already be deducted during order creation
                // No need to deduct again here
            });

            console.log('Payment completed successfully:', pf_payment_id);
            
            // TODO: Send order confirmation email
            // await emailService.sendOrderConfirmation(orderId);
        } else {
            // Payment failed or cancelled
            await query(
                `UPDATE payments 
                 SET status = 'failed', 
                     payfast_payment_id = $1,
                     transaction_id = $2,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE order_id = $3`,
                [pf_payment_id, m_payment_id, orderId]
            );

            await query(
                `UPDATE orders 
                 SET payment_status = 'failed',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [orderId]
            );

            console.log('Payment failed:', pf_payment_id, 'Status:', payment_status);
        }

        // Respond with OK (PayFast expects 200 OK response)
        res.status(200).send('OK');

    } catch (error) {
        console.error('PayFast ITN error:', error);
        // Still respond with 200 to prevent PayFast retries on server errors
        // Log error with details for debugging
        res.status(200).send('ITN processing error logged - please contact support');
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
