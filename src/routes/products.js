const express = require('express');
const router = express.Router();
const { getQuery, allQuery } = require('../config/database');

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
