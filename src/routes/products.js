const express = require('express');
const router = express.Router();
const { getQuery, allQuery } = require('../config/database');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');

// Helper function to sanitize LIKE patterns (prevent wildcard injection)
function sanitizeLikePattern(input) {
    if (!input) return '';
    // Escape special LIKE characters: \, %, and _
    return input.replace(/[\\%_]/g, '\\$&');
}

// Get featured products
router.get('/featured', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

        // Get featured products (products with highest stock or newest)
        const products = await allQuery(
            `SELECT * FROM products 
             WHERE is_active = TRUE 
             ORDER BY created_at DESC 
             LIMIT $1`,
            [parsedLimit]
        );

        res.json({
            success: true,
            data: products
        });
    } catch (error) {
        console.error('Get featured products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load featured products'
        });
    }
});

// Advanced product search
router.get('/search', async (req, res) => {
    try {
        const { q, category, min_price, max_price, in_stock } = req.query;
        const { page, limit, offset } = getPaginationParams(req.query);

        let sql = 'SELECT * FROM products WHERE is_active = TRUE';
        const params = [];
        let paramIndex = 1;

        // Search query
        if (q) {
            const searchTerm = `%${sanitizeLikePattern(q)}%`;
            sql += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR sku ILIKE $${paramIndex})`;
            params.push(searchTerm);
            paramIndex++;
        }

        // Category filter
        if (category) {
            sql += ` AND category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }

        // Price range filter
        if (min_price) {
            sql += ` AND price_incl_vat >= $${paramIndex}`;
            params.push(parseFloat(min_price));
            paramIndex++;
        }

        if (max_price) {
            sql += ` AND price_incl_vat <= $${paramIndex}`;
            params.push(parseFloat(max_price));
            paramIndex++;
        }

        // Stock filter
        if (in_stock === 'true') {
            sql += ' AND stock_quantity > 0';
        }

        // Get total count for pagination
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const countResult = await getQuery(countSql, params);
        const total = parseInt(countResult.total, 10);

        // Add pagination
        sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const products = await allQuery(sql, params);

        res.json({
            success: true,
            data: products,
            meta: buildPaginationMeta(page, limit, total)
        });
    } catch (error) {
        console.error('Product search error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search products'
        });
    }
});

// Get all products (public endpoint)
router.get('/', async (req, res) => {
    try {
        const { category, search, limit = 50 } = req.query;
        let sql = 'SELECT * FROM products WHERE is_active = TRUE';
        const params = [];

        if (category) {
            sql += ' AND category = $1';
            params.push(category);
        }

        if (search) {
            const searchTerm = `%${search}%`;
            const paramIndex = params.length + 1;
            sql += ` AND (name LIKE $${paramIndex} OR description LIKE $${paramIndex + 1})`;
            params.push(searchTerm, searchTerm);
        }

        const parsedLimit = Number.parseInt(limit, 10);
        const safeLimit = Number.isNaN(parsedLimit)
            ? 50
            : Math.min(Math.max(parsedLimit, 1), 100);

        const limitParamIndex = params.length + 1;
        sql += ` ORDER BY created_at DESC LIMIT $${limitParamIndex}`;
        params.push(safeLimit);

        const products = await allQuery(sql, params);

        res.json({
            success: true,
            data: products
        });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load products'
        });
    }
});

// Get product categories
router.get('/categories/list', async (req, res) => {
    try {
        const categories = await allQuery(`
            SELECT DISTINCT category, COUNT(*) as product_count
            FROM products
            WHERE is_active = TRUE
            GROUP BY category
            ORDER BY category
        `);

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load categories'
        });
    }
});

// Get product by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const product = await getQuery(
            'SELECT * FROM products WHERE id = $1 AND is_active = TRUE',
            [id]
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            data: product
        });
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load product'
        });
    }
});

module.exports = router;
