/**
 * Product Reviews Routes
 */

const express = require('express');
const router = express.Router();
const reviewsController = require('../controllers/reviewsController');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');

// =====================================================
// PUBLIC ROUTES
// =====================================================

/**
 * GET /api/reviews/product/:productId
 * Get reviews for a specific product
 */
router.get('/product/:productId', reviewsController.getProductReviews);

/**
 * POST /api/reviews/:id/helpful
 * Mark a review as helpful
 */
router.post('/:id/helpful', reviewsController.markHelpful);

// =====================================================
// AUTHENTICATED CUSTOMER ROUTES
// =====================================================

/**
 * POST /api/reviews
 * Submit a new review (authenticated)
 */
router.post('/', authenticateToken, reviewsController.submitReview);

/**
 * PUT /api/reviews/:id
 * Update own review (authenticated)
 */
router.put('/:id', authenticateToken, reviewsController.updateReview);

/**
 * DELETE /api/reviews/:id
 * Delete own review (authenticated)
 */
router.delete('/:id', authenticateToken, reviewsController.deleteReview);

// =====================================================
// ADMIN ROUTES
// =====================================================

/**
 * GET /api/admin/reviews
 * Get all reviews for admin moderation
 */
router.get('/admin/all', authenticateAdmin, reviewsController.getAllReviews);

/**
 * PUT /api/admin/reviews/:id/approve
 * Approve a review
 */
router.put('/admin/:id/approve', authenticateAdmin, reviewsController.approveReview);

/**
 * PUT /api/admin/reviews/:id/reject
 * Reject a review
 */
router.put('/admin/:id/reject', authenticateAdmin, reviewsController.rejectReview);

module.exports = router;
