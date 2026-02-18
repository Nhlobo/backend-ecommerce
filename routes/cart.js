/**
 * Cart Routes
 * Routes for shopping cart management (guest and authenticated users)
 */

const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { authenticateToken } = require('../middleware/auth');
const { validateCartQuantity, validateCartTotals } = require('../middleware/serverValidation');

// Note: Cart routes support both authenticated and guest users
// authenticateToken is optional - if not authenticated, uses session_id

/**
 * GET /api/cart
 * Get cart items
 */
router.get('/', cartController.getCart);

/**
 * POST /api/cart/items
 * Add item to cart
 */
router.post('/items', validateCartQuantity, cartController.addToCart);

/**
 * PUT /api/cart/items/:id
 * Update cart item quantity
 */
router.put('/items/:id', validateCartQuantity, cartController.updateCartItem);

/**
 * DELETE /api/cart/items/:id
 * Remove item from cart
 */
router.delete('/items/:id', cartController.removeCartItem);

/**
 * DELETE /api/cart
 * Clear cart
 */
router.delete('/', cartController.clearCart);

/**
 * POST /api/cart/validate
 * Server-side validation of cart totals and stock
 */
router.post('/validate', cartController.validateCart);

/**
 * POST /api/cart/merge
 * Merge guest cart into authenticated user cart (requires authentication)
 */
router.post('/merge', authenticateToken, cartController.mergeCart);

module.exports = router;
