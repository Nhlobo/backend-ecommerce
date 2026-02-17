/**
 * Admin Routes
 * Routes for admin-only operations
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const reportsController = require('../controllers/reportsController');
const inventoryAlertsController = require('../controllers/inventoryAlertsController');
const { authenticateAdmin } = require('../middleware/auth');

// All routes require admin authentication
router.use(authenticateAdmin);

// =====================================================
// USER MANAGEMENT
// =====================================================

/**
 * GET /api/admin/users
 * List customers
 */
router.get('/users', adminController.listCustomers);

/**
 * PUT /api/admin/users/:id
 * Update user info
 */
router.put('/users/:id', adminController.updateCustomer);

// =====================================================
// INVENTORY MANAGEMENT
// =====================================================

/**
 * GET /api/admin/inventory/low-stock
 * Get products with low stock
 */
router.get('/inventory/low-stock', adminController.getLowStock);

/**
 * GET /api/admin/inventory/stats
 * Get inventory statistics
 */
router.get('/inventory/stats', inventoryAlertsController.getInventoryStats);

/**
 * POST /api/admin/inventory/check-alerts
 * Check and send low stock alerts
 */
router.post('/inventory/check-alerts', inventoryAlertsController.checkLowStock);

/**
 * PUT /api/admin/inventory/:productId/threshold
 * Update stock threshold for a product
 */
router.put('/inventory/:productId/threshold', inventoryAlertsController.updateStockThreshold);

/**
 * PUT /api/admin/inventory/:variantId
 * Update stock levels
 */
router.put('/inventory/:variantId', adminController.updateStock);

// =====================================================
// LOGS & AUDIT
// =====================================================

/**
 * GET /api/admin/logs
 * Get admin activity logs
 */
router.get('/logs', adminController.getAdminLogs);

/**
 * GET /api/admin/security-logs
 * Get security event logs
 */
router.get('/security-logs', adminController.getSecurityLogs);

// =====================================================
// REPORTS & ANALYTICS
// =====================================================

/**
 * GET /api/admin/reports/sales
 * Sales reports with date filters
 */
router.get('/reports/sales', reportsController.getSalesReport);

/**
 * GET /api/admin/reports/products
 * Product performance
 */
router.get('/reports/products', reportsController.getProductPerformance);

/**
 * GET /api/admin/reports/revenue
 * Revenue analytics
 */
router.get('/reports/revenue', reportsController.getRevenueAnalytics);

/**
 * GET /api/admin/reports/customers
 * Customer statistics
 */
router.get('/reports/customers', reportsController.getCustomerStats);

module.exports = router;
