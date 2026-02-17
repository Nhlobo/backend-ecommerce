/**
 * Cart Routes Integration Example
 * 
 * This file shows how to integrate the cart controller into your routes.
 * Copy the relevant sections into your actual routes file.
 */

const express = require('express');
const router = express.Router();

// Import cart controller
const cartController = require('../controllers/cartController');

// Import middleware
const { authenticateOptional } = require('../middleware/auth');
const { validateCartQuantity } = require('../middleware/serverValidation');

/**
 * Authentication Middleware Options:
 * 
 * 1. authenticateOptional - Works for both authenticated and guest users
 *    (This is what you want for cart routes)
 * 
 * 2. authenticate - Requires authentication
 *    (Only for authenticated user routes)
 */

// ============================================
// CART ROUTES
// ============================================

/**
 * Get cart items
 * GET /api/cart
 * 
 * Headers:
 * - x-session-id: (optional for guests)
 * - Authorization: Bearer <token> (optional for authenticated users)
 */
router.get('/cart', authenticateOptional, cartController.getCart);

/**
 * Add item to cart
 * POST /api/cart
 * 
 * Body: { variant_id: "uuid", quantity: 2 }
 */
router.post('/cart', 
    authenticateOptional, 
    validateCartQuantity, 
    cartController.addToCart
);

/**
 * Update cart item quantity
 * PUT /api/cart/:itemId
 * 
 * Body: { quantity: 3 }
 */
router.put('/cart/:itemId', 
    authenticateOptional, 
    cartController.updateCartItem
);

/**
 * Remove item from cart
 * DELETE /api/cart/:itemId
 */
router.delete('/cart/:itemId', 
    authenticateOptional, 
    cartController.removeCartItem
);

/**
 * Clear all cart items
 * DELETE /api/cart
 */
router.delete('/cart', 
    authenticateOptional, 
    cartController.clearCart
);

/**
 * Validate cart before checkout
 * POST /api/cart/validate
 * 
 * Use this endpoint before proceeding to checkout to ensure:
 * - Products are still available
 * - Prices are current
 * - Stock is sufficient
 */
router.post('/cart/validate', 
    authenticateOptional, 
    cartController.validateCart
);

// ============================================
// EXAMPLE: Checkout Flow with Cart Validation
// ============================================

const { validateCartTotals, validateOrderTotals } = require('../middleware/serverValidation');

/**
 * Create order from cart
 * POST /api/orders
 * 
 * This shows how to use cart validation in the checkout flow
 */
router.post('/orders',
    authenticateOptional,
    // First validate cart items and calculate totals
    validateCartTotals,
    // Then validate order totals with discounts/taxes
    validateOrderTotals,
    // Finally create the order
    async (req, res) => {
        // Your order creation logic here
        // req.validatedOrder contains the validated data
        console.log('Validated order:', req.validatedOrder);
        
        res.json({
            success: true,
            message: 'Order created',
            order: req.validatedOrder
        });
    }
);

module.exports = router;

/**
 * USAGE IN YOUR MAIN ROUTES FILE:
 * 
 * const cartRoutes = require('./routes/cartRoutes'); // or wherever you put these routes
 * app.use('/api', cartRoutes);
 */

/**
 * EXAMPLE: Creating authenticateOptional Middleware
 * 
 * If you don't have authenticateOptional middleware yet, here's how to create it:
 */

// In middleware/auth.js:
const authenticateOptional = (req, res, next) => {
    // Try to authenticate, but don't fail if no token
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded; // { id: userId, email: userEmail, ... }
        } catch (error) {
            // Invalid token, but continue as guest
            req.user = null;
        }
    }
    
    next();
};

// Export it:
// module.exports = { authenticate, authenticateOptional };
