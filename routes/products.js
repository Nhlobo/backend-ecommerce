/**
 * Product Routes
 * Public routes for products and admin routes for product management
 */

const express = require('express');
const router = express.Router();
const productsController = require('../controllers/productsController');
const { authenticateAdmin } = require('../middleware/auth');
const { validateProductPrice } = require('../middleware/serverValidation');

// =====================================================
// PUBLIC ROUTES
// =====================================================

/**
 * GET /api/products/search
 * Search products with full-text search (must be before /:id)
 */
router.get('/search', productsController.searchProducts);

/**
 * GET /api/products
 * List all products with filtering, pagination, and sorting
 */
router.get('/', productsController.listProducts);

/**
 * GET /api/products/:id
 * Get product details with variants
 */
router.get('/:id', productsController.getProduct);

/**
 * GET /api/products/:id/variants
 * Get all variants for a product
 */
router.get('/:id/variants', productsController.getProductVariants);

// =====================================================
// ADMIN ROUTES (Protected)
// =====================================================

/**
 * POST /api/products
 * Create a new product (admin only)
 */
router.post('/', authenticateAdmin, validateProductPrice, productsController.createProduct);

/**
 * PUT /api/products/:id
 * Update a product (admin only)
 */
router.put('/:id', authenticateAdmin, validateProductPrice, productsController.updateProduct);

/**
 * DELETE /api/products/:id
 * Delete a product (admin only)
 */
router.delete('/:id', authenticateAdmin, productsController.deleteProduct);

/**
 * POST /api/products/:id/variants
 * Add a variant to a product (admin only)
 */
router.post('/:id/variants', authenticateAdmin, validateProductPrice, productsController.createVariant);

// =====================================================
// VARIANT ROUTES (Admin)
// =====================================================

/**
 * PUT /api/variants/:id
 * Update a variant (admin only)
 */
router.put('/variants/:id', authenticateAdmin, validateProductPrice, productsController.updateVariant);

/**
 * DELETE /api/variants/:id
 * Delete a variant (admin only)
 */
router.delete('/variants/:id', authenticateAdmin, productsController.deleteVariant);

module.exports = router;
