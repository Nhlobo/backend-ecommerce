/**
 * Payment Routes
 * Routes for PayFast payment integration
 */

const express = require('express');
const router = express.Router();
const payfastController = require('../controllers/payfastController');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');

// =====================================================
// CUSTOMER ROUTES
// =====================================================

/**
 * POST /api/payments/create
 * Create PayFast payment with signature generation
 */
router.post('/create', authenticateToken, payfastController.createPayment);

/**
 * POST /api/payments/payfast/notify
 * PayFast ITN (Instant Transaction Notification) webhook
 * Public endpoint - no authentication required
 */
router.post('/payfast/notify', payfastController.payfastNotify);

/**
 * POST /api/payments/verify
 * Verify payment signature
 */
router.post('/verify', payfastController.verifyPayment);

/**
 * GET /api/payments/:orderId
 * Get payment status by order ID
 */
router.get('/:orderId', authenticateToken, payfastController.getPaymentStatus);

// =====================================================
// ADMIN ROUTES (Protected)
// =====================================================

/**
 * POST /api/admin/payments/:id/refund
 * Process refund (admin only)
 */
router.post('/admin/:id/refund', authenticateAdmin, payfastController.processRefund);

module.exports = router;
