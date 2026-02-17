/**
 * Inventory Alerts Controller
 * Handles low stock alerts and notifications
 */

const { query } = require('../db/connection');
const { sendLowStockAlert } = require('../services/emailService');

/**
 * Check for low stock products and send alerts
 * This can be called manually or via cron job
 */
const checkLowStock = async (req, res) => {
    try {
        // Get all products with stock below threshold
        const result = await query(
            `SELECT 
                id, name, sku, stock_quantity, low_stock_threshold
             FROM products
             WHERE stock_quantity <= low_stock_threshold
             AND stock_quantity > 0
             AND is_active = true
             ORDER BY stock_quantity ASC`
        );

        const lowStockProducts = result.rows;

        if (lowStockProducts.length === 0) {
            return res.json({
                success: true,
                message: 'No low stock products found',
                data: {
                    count: 0,
                    products: []
                }
            });
        }

        // Get admin emails for notifications
        const adminResult = await query(
            'SELECT email FROM admin_users WHERE is_active = true'
        );

        const adminEmails = adminResult.rows.map(admin => admin.email);

        // Send alerts to all admins (non-blocking)
        if (adminEmails.length > 0) {
            sendLowStockAlert(lowStockProducts, adminEmails).catch(error => {
                console.error('Failed to send low stock alerts:', error);
            });
        }

        res.json({
            success: true,
            message: `Found ${lowStockProducts.length} low stock products. Alerts sent to ${adminEmails.length} admins.`,
            data: {
                count: lowStockProducts.length,
                products: lowStockProducts,
                alertsSentTo: adminEmails.length
            }
        });

    } catch (error) {
        console.error('Check low stock error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check low stock. Please try again.'
        });
    }
};

/**
 * Get low stock products list (admin only)
 * GET /api/inventory/low-stock
 */
const getLowStockProducts = async (req, res) => {
    try {
        const result = await query(
            `SELECT 
                id, name, sku, stock_quantity, low_stock_threshold,
                base_price, category, is_active
             FROM products
             WHERE stock_quantity <= low_stock_threshold
             AND is_active = true
             ORDER BY stock_quantity ASC`
        );

        res.json({
            success: true,
            data: {
                count: result.rows.length,
                products: result.rows
            }
        });

    } catch (error) {
        console.error('Get low stock products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch low stock products. Please try again.'
        });
    }
};

/**
 * Update stock threshold for a product (admin only)
 * PUT /api/inventory/:productId/threshold
 */
const updateStockThreshold = async (req, res) => {
    try {
        const { productId } = req.params;
        const { low_stock_threshold } = req.body;

        // Validate threshold
        if (!low_stock_threshold || low_stock_threshold < 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid low stock threshold is required'
            });
        }

        // Update threshold
        const result = await query(
            `UPDATE products
             SET low_stock_threshold = $1
             WHERE id = $2
             RETURNING id, name, low_stock_threshold`,
            [low_stock_threshold, productId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            message: 'Stock threshold updated successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Update stock threshold error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update stock threshold. Please try again.'
        });
    }
};

/**
 * Get inventory statistics (admin only)
 * GET /api/inventory/stats
 */
const getInventoryStats = async (req, res) => {
    try {
        const stats = await query(
            `SELECT 
                COUNT(*) as total_products,
                COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as out_of_stock,
                COUNT(CASE WHEN stock_quantity <= low_stock_threshold AND stock_quantity > 0 THEN 1 END) as low_stock,
                COUNT(CASE WHEN stock_quantity > low_stock_threshold THEN 1 END) as in_stock,
                SUM(stock_quantity) as total_units,
                AVG(stock_quantity) as avg_stock_per_product
             FROM products
             WHERE is_active = true`
        );

        res.json({
            success: true,
            data: {
                totalProducts: parseInt(stats.rows[0].total_products) || 0,
                outOfStock: parseInt(stats.rows[0].out_of_stock) || 0,
                lowStock: parseInt(stats.rows[0].low_stock) || 0,
                inStock: parseInt(stats.rows[0].in_stock) || 0,
                totalUnits: parseInt(stats.rows[0].total_units) || 0,
                avgStockPerProduct: parseFloat(stats.rows[0].avg_stock_per_product) || 0
            }
        });

    } catch (error) {
        console.error('Get inventory stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch inventory statistics. Please try again.'
        });
    }
};

module.exports = {
    checkLowStock,
    getLowStockProducts,
    updateStockThreshold,
    getInventoryStats
};
