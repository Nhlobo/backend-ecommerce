/**
 * PayFast Payment Gateway Service
 * Complete PayFast integration with security best practices
 */

const crypto = require('crypto');
const https = require('https');
const { query } = require('../db/connection');

/**
 * PayFast server IP addresses for whitelist validation
 * Source: https://developers.payfast.co.za/docs#ip_addresses
 */
const PAYFAST_IPS = [
    '197.97.145.144',
    '41.74.179.194',
    '41.74.179.195',
    '41.74.179.196',
    '41.74.179.197',
    '41.74.179.198',
    '41.74.179.199',
    '197.97.145.145'
];

/**
 * Generate MD5 signature for PayFast
 * @param {Object} data - Payment data object
 * @param {string} passphrase - Optional passphrase
 * @returns {string} MD5 signature
 */
const generateSignature = (data, passphrase = null) => {
    // Create parameter string
    let pfOutput = '';
    
    // Sort keys and build parameter string
    const sortedKeys = Object.keys(data).filter(key => key !== 'signature').sort();
    
    for (const key of sortedKeys) {
        if (data[key] !== '' && data[key] !== null && data[key] !== undefined) {
            pfOutput += `${key}=${encodeURIComponent(data[key].toString().trim()).replace(/%20/g, '+')}&`;
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
 * Generate payment data for PayFast with signature
 * @param {Object} order - Order object
 * @returns {Object} Payment data with signature
 */
const generatePaymentData = (order) => {
    if (!order) {
        throw new Error('Order data is required');
    }

    if (!process.env.PAYFAST_MERCHANT_ID || !process.env.PAYFAST_MERCHANT_KEY) {
        throw new Error('PayFast merchant credentials not configured');
    }

    // Prepare payment data
    const data = {
        merchant_id: process.env.PAYFAST_MERCHANT_ID,
        merchant_key: process.env.PAYFAST_MERCHANT_KEY,
        return_url: process.env.PAYFAST_RETURN_URL || `${process.env.FRONTEND_URL}/payment/success`,
        cancel_url: process.env.PAYFAST_CANCEL_URL || `${process.env.FRONTEND_URL}/payment/cancel`,
        notify_url: process.env.PAYFAST_NOTIFY_URL || `${process.env.BACKEND_URL}/api/payments/payfast/notify`,
        name_first: order.shipping_name || order.name || 'Customer',
        email_address: order.guest_email || order.email || 'customer@example.com',
        m_payment_id: order.id.toString(),
        amount: parseFloat(order.total).toFixed(2),
        item_name: `Order ${order.order_number}`,
        item_description: `Payment for order ${order.order_number}`,
        custom_str1: order.id.toString(), // Order ID for reference
        custom_str2: order.order_number
    };

    // Generate signature
    const passphrase = process.env.PAYFAST_PASSPHRASE || null;
    data.signature = generateSignature(data, passphrase);

    return data;
};

/**
 * Verify ITN (Instant Transaction Notification) from PayFast
 * @param {Object} data - ITN data from PayFast
 * @param {string} sourceIp - IP address of the request
 * @returns {Promise<Object>} Verification result
 */
const verifyITN = async (data, sourceIp = null) => {
    const result = {
        valid: false,
        errors: [],
        warnings: []
    };

    try {
        // 1. Verify source IP (if provided and not in development)
        if (sourceIp && process.env.NODE_ENV === 'production') {
            if (!PAYFAST_IPS.includes(sourceIp)) {
                result.errors.push(`Invalid source IP: ${sourceIp}`);
                return result;
            }
        }

        // 2. Verify signature
        if (!data.signature) {
            result.errors.push('No signature provided');
            return result;
        }

        const receivedSignature = data.signature;
        const dataWithoutSignature = { ...data };
        delete dataWithoutSignature.signature;

        const passphrase = process.env.PAYFAST_PASSPHRASE || null;
        const calculatedSignature = generateSignature(dataWithoutSignature, passphrase);

        if (receivedSignature !== calculatedSignature) {
            result.errors.push('Invalid signature');
            return result;
        }

        // 3. Verify payment status
        if (data.payment_status !== 'COMPLETE') {
            result.warnings.push(`Payment status is ${data.payment_status}, not COMPLETE`);
            // Don't mark as invalid, but include warning
        }

        // 4. Verify amounts match order
        if (data.custom_str1) {
            const orderResult = await query(
                'SELECT total, status FROM orders WHERE id = $1',
                [data.custom_str1]
            );

            if (orderResult.rows.length === 0) {
                result.errors.push('Order not found');
                return result;
            }

            const order = orderResult.rows[0];
            const orderTotal = parseFloat(order.total);
            const paymentAmount = parseFloat(data.amount_gross);

            if (Math.abs(orderTotal - paymentAmount) > 0.01) {
                result.errors.push(
                    `Amount mismatch: expected ${orderTotal}, received ${paymentAmount}`
                );
                return result;
            }

            // Check if order is in valid state for payment
            if (['delivered', 'cancelled'].includes(order.status)) {
                result.warnings.push(
                    `Order is already in ${order.status} state`
                );
            }
        }

        // 5. Optionally verify with PayFast server (recommended for production)
        if (process.env.NODE_ENV === 'production' && process.env.PAYFAST_VERIFY_SERVER === 'true') {
            const serverVerification = await verifyWithPayFastServer(data);
            if (!serverVerification) {
                result.errors.push('Server verification failed');
                return result;
            }
        }

        // All checks passed
        result.valid = true;
        return result;

    } catch (error) {
        result.errors.push(`Verification error: ${error.message}`);
        return result;
    }
};

/**
 * Verify ITN with PayFast server
 * @param {Object} data - ITN data
 * @returns {Promise<boolean>} True if verification succeeds
 */
const verifyWithPayFastServer = (data) => {
    return new Promise((resolve, reject) => {
        const pfHost = process.env.PAYFAST_MODE === 'live' 
            ? 'www.payfast.co.za' 
            : 'sandbox.payfast.co.za';

        const pfParamString = Object.keys(data)
            .map(key => `${key}=${encodeURIComponent(data[key])}`)
            .join('&');

        const options = {
            hostname: pfHost,
            port: 443,
            path: '/eng/query/validate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(pfParamString)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                resolve(body === 'VALID');
            });
        });

        req.on('error', (error) => {
            console.error('PayFast server verification error:', error);
            reject(error);
        });

        req.write(pfParamString);
        req.end();
    });
};

/**
 * Get PayFast payment URL
 * @returns {string} PayFast payment URL
 */
const getPaymentUrl = () => {
    if (process.env.PAYFAST_MODE === 'live') {
        return 'https://www.payfast.co.za/eng/process';
    }
    return 'https://sandbox.payfast.co.za/eng/process';
};

/**
 * Process payment completion
 * Updates order and payment records after successful payment
 * @param {Object} itnData - ITN data from PayFast
 * @returns {Promise<Object>} Processing result
 */
const processPaymentCompletion = async (itnData) => {
    try {
        const orderId = itnData.custom_str1;
        const paymentId = itnData.pf_payment_id;
        const amount = parseFloat(itnData.amount_gross);

        // Update payment record
        await query(
            `UPDATE payments 
             SET status = 'completed',
                 payfast_payment_id = $1,
                 transaction_id = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE order_id = $3 AND status = 'pending'`,
            [paymentId, itnData.m_payment_id, orderId]
        );

        // Update order status
        await query(
            `UPDATE orders 
             SET status = 'processing',
                 payment_status = 'paid',
                 paid_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [orderId]
        );

        return {
            success: true,
            orderId,
            paymentId,
            amount
        };
    } catch (error) {
        console.error('Payment completion processing error:', error);
        throw error;
    }
};

module.exports = {
    generatePaymentData,
    generateSignature,
    verifyITN,
    verifyWithPayFastServer,
    getPaymentUrl,
    processPaymentCompletion,
    PAYFAST_IPS
};
