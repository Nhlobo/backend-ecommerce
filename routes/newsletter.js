/**
 * Newsletter Routes
 */

const express = require('express');
const router = express.Router();
const newsletterController = require('../controllers/newsletterController');
const { authenticateAdmin } = require('../middleware/auth');

// =====================================================
// PUBLIC ROUTES
// =====================================================

/**
 * POST /api/newsletter/subscribe
 * Subscribe to newsletter
 */
router.post('/subscribe', newsletterController.subscribe);

/**
 * GET /api/newsletter/verify/:token
 * Verify newsletter subscription
 */
router.get('/verify/:token', newsletterController.verifySubscription);

/**
 * POST /api/newsletter/unsubscribe
 * Unsubscribe from newsletter
 */
router.post('/unsubscribe', newsletterController.unsubscribe);

// =====================================================
// ADMIN ROUTES
// =====================================================

/**
 * GET /api/newsletter/admin/subscribers
 * Get all subscribers (admin)
 */
router.get('/admin/subscribers', authenticateAdmin, newsletterController.getSubscribers);

/**
 * GET /api/newsletter/admin/export
 * Export subscribers as CSV (admin)
 */
router.get('/admin/export', authenticateAdmin, newsletterController.exportSubscribers);

module.exports = router;
