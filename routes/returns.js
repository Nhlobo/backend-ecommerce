/**
 * Returns Routes
 * Routes for return request management
 */

const express = require('express');
const router = express.Router();
const returnsController = require('../controllers/returnsController');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');

// =====================================================
// CUSTOMER ROUTES (Protected)
// =====================================================

/**
 * POST /api/returns
 * Create return request
 */
router.post('/', authenticateToken, returnsController.createReturn);

/**
 * GET /api/returns
 * Get user's returns
 */
router.get('/', authenticateToken, returnsController.getUserReturns);

// =====================================================
// ADMIN ROUTES (Protected)
// =====================================================

/**
 * GET /api/admin/returns
 * List all returns (admin only)
 */
router.get('/admin/all', authenticateAdmin, returnsController.listAllReturns);

/**
 * PUT /api/admin/returns/:id
 * Update return status (admin only)
 */
router.put('/admin/:id', authenticateAdmin, returnsController.updateReturnStatus);

module.exports = router;
