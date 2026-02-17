/**
 * Order Routes
 * Routes for order creation and management
 */

const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/ordersController');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');
const { validateCartTotals, validateOrderTotals } = require('../middleware/serverValidation');

// =====================================================
// CUSTOMER ROUTES (Protected)
// =====================================================

/**
 * POST /api/orders
 * Create order from cart (authenticated users only)
 */
router.post('/', authenticateToken, validateCartTotals, validateOrderTotals, ordersController.createOrder);

/**
 * GET /api/orders
 * Get user's orders
 */
router.get('/', authenticateToken, ordersController.getUserOrders);

/**
 * GET /api/orders/:id
 * Get order details
 */
router.get('/:id', authenticateToken, ordersController.getOrderById);

// =====================================================
// ADMIN ROUTES (Protected)
// =====================================================

/**
 * GET /api/admin/orders
 * List all orders with filters (admin only)
 */
router.get('/admin/all', authenticateAdmin, ordersController.getAllOrders);

/**
 * PUT /api/orders/:id/status
 * Update order status (admin only)
 */
router.put('/:id/status', authenticateAdmin, ordersController.updateOrderStatus);

module.exports = router;
