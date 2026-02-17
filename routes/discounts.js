/**
 * Discount Routes
 * Routes for discount code validation and management
 */

const express = require('express');
const router = express.Router();
const discountsController = require('../controllers/discountsController');
const { authenticateAdmin } = require('../middleware/auth');

// =====================================================
// PUBLIC ROUTES
// =====================================================

/**
 * POST /api/discounts/validate
 * Validate discount code
 */
router.post('/validate', discountsController.validateDiscount);

// =====================================================
// ADMIN ROUTES (Protected)
// =====================================================

/**
 * POST /api/admin/discounts
 * Create discount code (admin only)
 */
router.post('/admin', authenticateAdmin, discountsController.createDiscount);

/**
 * GET /api/admin/discounts
 * List all discount codes (admin only)
 */
router.get('/admin', authenticateAdmin, discountsController.listDiscounts);

/**
 * PUT /api/admin/discounts/:id
 * Update discount code (admin only)
 */
router.put('/admin/:id', authenticateAdmin, discountsController.updateDiscount);

/**
 * DELETE /api/admin/discounts/:id
 * Delete discount code (admin only)
 */
router.delete('/admin/:id', authenticateAdmin, discountsController.deleteDiscount);

module.exports = router;
