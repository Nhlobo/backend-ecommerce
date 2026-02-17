/**
 * Products Controller
 * Handles product and variant management for e-commerce
 */

const { query, transaction } = require('../db/connection');

/**
 * Helper function to log admin actions
 */
const logAdminAction = async (adminId, action, details, ipAddress, userAgent) => {
    try {
        await query(
            `INSERT INTO admin_logs (admin_id, action, details, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5)`,
            [adminId, action, JSON.stringify(details), ipAddress, userAgent]
        );
    } catch (error) {
        console.error('Failed to log admin action:', error);
    }
};

/**
 * List products with filters, pagination, and sorting (PUBLIC)
 * GET /api/products
 */
const listProducts = async (req, res) => {
    try {
        const {
            category_id,
            texture,
            length,
            color,
            price_min,
            price_max,
            active = 'true',
            page = 1,
            limit = 20,
            sort = 'created_at',
            order = 'DESC'
        } = req.query;

        // Validate pagination
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        // Validate sort field
        const validSortFields = ['name', 'price', 'created_at'];
        const sortField = validSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Build WHERE conditions
        const conditions = [];
        const params = [];
        let paramCount = 1;

        // Filter by active status
        if (active !== 'all') {
            conditions.push(`p.active = $${paramCount}`);
            params.push(active === 'true');
            paramCount++;
        }

        // Filter by category
        if (category_id) {
            conditions.push(`p.category_id = $${paramCount}`);
            params.push(parseInt(category_id));
            paramCount++;
        }

        // Filter by variant attributes
        if (texture) {
            conditions.push(`EXISTS (
                SELECT 1 FROM product_variants pv 
                WHERE pv.product_id = p.id AND pv.texture ILIKE $${paramCount}
            )`);
            params.push(`%${texture}%`);
            paramCount++;
        }

        if (length) {
            conditions.push(`EXISTS (
                SELECT 1 FROM product_variants pv 
                WHERE pv.product_id = p.id AND pv.length = $${paramCount}
            )`);
            params.push(length);
            paramCount++;
        }

        if (color) {
            conditions.push(`EXISTS (
                SELECT 1 FROM product_variants pv 
                WHERE pv.product_id = p.id AND pv.color ILIKE $${paramCount}
            )`);
            params.push(`%${color}%`);
            paramCount++;
        }

        // Filter by price range (using base_price or min variant price)
        if (price_min) {
            conditions.push(`(
                p.base_price >= $${paramCount} OR 
                (SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id = p.id) >= $${paramCount}
            )`);
            params.push(parseFloat(price_min));
            paramCount++;
        }

        if (price_max) {
            conditions.push(`(
                p.base_price <= $${paramCount} OR 
                (SELECT MAX(pv.price) FROM product_variants pv WHERE pv.product_id = p.id) <= $${paramCount}
            )`);
            params.push(parseFloat(price_max));
            paramCount++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Map sort field to actual column
        let orderByField = 'p.created_at';
        if (sortField === 'name') {
            orderByField = 'p.name';
        } else if (sortField === 'price') {
            orderByField = 'COALESCE(p.base_price, (SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id = p.id))';
        }

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM products p
            ${whereClause}
        `;
        const countResult = await query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);

        // Get products with category info and variant count
        const productsQuery = `
            SELECT 
                p.id,
                p.name,
                p.slug,
                p.description,
                p.category_id,
                p.category as legacy_category,
                p.base_price,
                p.stock_quantity as legacy_stock,
                p.active,
                p.is_active as legacy_is_active,
                p.created_at,
                p.updated_at,
                c.name as category_name,
                c.slug as category_slug,
                COUNT(DISTINCT pv.id) as variant_count,
                COALESCE(MIN(pv.price), p.base_price) as min_price,
                COALESCE(MAX(pv.price), p.base_price) as max_price,
                COALESCE(SUM(pv.stock), p.stock_quantity, 0) as total_stock
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_variants pv ON p.id = pv.product_id
            ${whereClause}
            GROUP BY p.id, c.name, c.slug
            ORDER BY ${orderByField} ${sortOrder}
            LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;
        
        params.push(limitNum, offset);
        const productsResult = await query(productsQuery, params);

        res.json({
            success: true,
            data: {
                products: productsResult.rows,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum)
                }
            }
        });

    } catch (error) {
        console.error('List products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
};

/**
 * Get single product by ID with all variants (PUBLIC)
 * GET /api/products/:id
 */
const getProduct = async (req, res) => {
    try {
        const { id } = req.params;

        // Get product with category
        const productQuery = `
            SELECT 
                p.*,
                p.is_active as legacy_is_active,
                c.id as category_id,
                c.name as category_name,
                c.slug as category_slug,
                c.description as category_description
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = $1
        `;
        const productResult = await query(productQuery, [id]);

        if (productResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const product = productResult.rows[0];

        // Get all variants for this product
        const variantsQuery = `
            SELECT *
            FROM product_variants
            WHERE product_id = $1
            ORDER BY price ASC
        `;
        const variantsResult = await query(variantsQuery, [id]);

        // Get average rating and review count
        const ratingQuery = `
            SELECT 
                COALESCE(AVG(rating), 0) as average_rating,
                COUNT(*) as review_count
            FROM product_reviews
            WHERE product_id = $1 AND is_approved = true
        `;
        const ratingResult = await query(ratingQuery, [id]);
        const { average_rating, review_count } = ratingResult.rows[0];

        res.json({
            success: true,
            data: {
                ...product,
                variants: variantsResult.rows,
                averageRating: parseFloat(average_rating) || 0,
                reviewCount: parseInt(review_count) || 0
            }
        });

    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product'
        });
    }
};

/**
 * Get all variants for a product (PUBLIC)
 * GET /api/products/:id/variants
 */
const getProductVariants = async (req, res) => {
    try {
        const { id } = req.params;

        // Verify product exists
        const productCheck = await query(
            'SELECT id, name FROM products WHERE id = $1',
            [id]
        );

        if (productCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Get variants
        const variantsQuery = `
            SELECT *
            FROM product_variants
            WHERE product_id = $1
            ORDER BY texture, length, color
        `;
        const variantsResult = await query(variantsQuery, [id]);

        res.json({
            success: true,
            data: {
                product_id: id,
                product_name: productCheck.rows[0].name,
                variants: variantsResult.rows
            }
        });

    } catch (error) {
        console.error('Get product variants error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product variants'
        });
    }
};

/**
 * Create new product (ADMIN)
 * POST /api/admin/products
 */
const createProduct = async (req, res) => {
    try {
        const { name, slug, description, category_id, active = true } = req.body;

        // Validate required fields
        if (!name || !slug) {
            return res.status(400).json({
                success: false,
                message: 'Name and slug are required'
            });
        }

        // Validate category exists if provided
        if (category_id) {
            const categoryCheck = await query(
                'SELECT id FROM categories WHERE id = $1',
                [category_id]
            );
            if (categoryCheck.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid category_id'
                });
            }
        }

        // Check if slug already exists
        const slugCheck = await query(
            'SELECT id FROM products WHERE slug = $1',
            [slug]
        );
        if (slugCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Slug already exists'
            });
        }

        // Insert product
        const insertQuery = `
            INSERT INTO products (name, slug, description, category_id, active, is_active)
            VALUES ($1, $2, $3, $4, $5, $5)
            RETURNING *
        `;
        const result = await query(insertQuery, [
            name,
            slug,
            description || null,
            category_id || null,
            active
        ]);

        const product = result.rows[0];

        // Log admin action
        await logAdminAction(
            req.admin.id,
            'create_product',
            { product_id: product.id, name, slug },
            req.ip,
            req.get('user-agent')
        );

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product
        });

    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create product'
        });
    }
};

/**
 * Update product (ADMIN)
 * PUT /api/admin/products/:id
 */
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug, description, category_id, active } = req.body;

        // Check if product exists
        const productCheck = await query(
            'SELECT * FROM products WHERE id = $1',
            [id]
        );
        if (productCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Validate category exists if provided
        if (category_id !== undefined) {
            const categoryCheck = await query(
                'SELECT id FROM categories WHERE id = $1',
                [category_id]
            );
            if (categoryCheck.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid category_id'
                });
            }
        }

        // Check slug uniqueness if changing
        if (slug && slug !== productCheck.rows[0].slug) {
            const slugCheck = await query(
                'SELECT id FROM products WHERE slug = $1 AND id != $2',
                [slug, id]
            );
            if (slugCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Slug already exists'
                });
            }
        }

        // Build update query dynamically
        const updates = [];
        const params = [];
        let paramCount = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramCount}`);
            params.push(name);
            paramCount++;
        }

        if (slug !== undefined) {
            updates.push(`slug = $${paramCount}`);
            params.push(slug);
            paramCount++;
        }

        if (description !== undefined) {
            updates.push(`description = $${paramCount}`);
            params.push(description);
            paramCount++;
        }

        if (category_id !== undefined) {
            updates.push(`category_id = $${paramCount}`);
            params.push(category_id);
            paramCount++;
        }

        if (active !== undefined) {
            updates.push(`active = $${paramCount}, is_active = $${paramCount}`);
            params.push(active);
            paramCount++;
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        updates.push(`updated_at = NOW()`);
        params.push(id);

        const updateQuery = `
            UPDATE products
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await query(updateQuery, params);
        const product = result.rows[0];

        // Log admin action
        await logAdminAction(
            req.admin.id,
            'update_product',
            { product_id: id, changes: req.body },
            req.ip,
            req.get('user-agent')
        );

        res.json({
            success: true,
            message: 'Product updated successfully',
            data: product
        });

    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update product'
        });
    }
};

/**
 * Soft delete product (ADMIN)
 * DELETE /api/admin/products/:id
 */
const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if product exists
        const productCheck = await query(
            'SELECT * FROM products WHERE id = $1',
            [id]
        );
        if (productCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Soft delete by setting active to false
        const result = await query(
            `UPDATE products 
             SET active = false, is_active = false, updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        // Log admin action
        await logAdminAction(
            req.admin.id,
            'delete_product',
            { product_id: id, name: productCheck.rows[0].name },
            req.ip,
            req.get('user-agent')
        );

        res.json({
            success: true,
            message: 'Product deleted successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete product'
        });
    }
};

/**
 * Create product variant (ADMIN)
 * POST /api/admin/products/:id/variants
 */
const createVariant = async (req, res) => {
    try {
        const { id: product_id } = req.params;
        const { sku, texture, length, color, price, stock } = req.body;

        // Validate required fields
        if (!sku || !texture || !length || !color || price === undefined || stock === undefined) {
            return res.status(400).json({
                success: false,
                message: 'SKU, texture, length, color, price, and stock are required'
            });
        }

        // Validate price and stock
        if (price <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Price must be greater than 0'
            });
        }

        if (stock < 0) {
            return res.status(400).json({
                success: false,
                message: 'Stock must be 0 or greater'
            });
        }

        // Check if product exists
        const productCheck = await query(
            'SELECT id, name FROM products WHERE id = $1',
            [product_id]
        );
        if (productCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if SKU already exists
        const skuCheck = await query(
            'SELECT id FROM product_variants WHERE sku = $1',
            [sku]
        );
        if (skuCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'SKU already exists'
            });
        }

        // Insert variant
        const insertQuery = `
            INSERT INTO product_variants (product_id, sku, texture, length, color, price, stock)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        const result = await query(insertQuery, [
            product_id,
            sku,
            texture,
            length,
            color,
            parseFloat(price),
            parseInt(stock)
        ]);

        const variant = result.rows[0];

        // Log admin action
        await logAdminAction(
            req.admin.id,
            'create_variant',
            { 
                product_id, 
                variant_id: variant.id, 
                sku,
                product_name: productCheck.rows[0].name 
            },
            req.ip,
            req.get('user-agent')
        );

        res.status(201).json({
            success: true,
            message: 'Variant created successfully',
            data: variant
        });

    } catch (error) {
        console.error('Create variant error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create variant'
        });
    }
};

/**
 * Update product variant (ADMIN)
 * PUT /api/admin/variants/:id
 */
const updateVariant = async (req, res) => {
    try {
        const { id } = req.params;
        const { sku, texture, length, color, price, stock } = req.body;

        // Check if variant exists
        const variantCheck = await query(
            `SELECT pv.*, p.name as product_name 
             FROM product_variants pv
             JOIN products p ON pv.product_id = p.id
             WHERE pv.id = $1`,
            [id]
        );
        if (variantCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Variant not found'
            });
        }

        // Validate price if provided
        if (price !== undefined && price <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Price must be greater than 0'
            });
        }

        // Validate stock if provided
        if (stock !== undefined && stock < 0) {
            return res.status(400).json({
                success: false,
                message: 'Stock must be 0 or greater'
            });
        }

        // Check SKU uniqueness if changing
        if (sku && sku !== variantCheck.rows[0].sku) {
            const skuCheck = await query(
                'SELECT id FROM product_variants WHERE sku = $1 AND id != $2',
                [sku, id]
            );
            if (skuCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'SKU already exists'
                });
            }
        }

        // Build update query dynamically
        const updates = [];
        const params = [];
        let paramCount = 1;

        if (sku !== undefined) {
            updates.push(`sku = $${paramCount}`);
            params.push(sku);
            paramCount++;
        }

        if (texture !== undefined) {
            updates.push(`texture = $${paramCount}`);
            params.push(texture);
            paramCount++;
        }

        if (length !== undefined) {
            updates.push(`length = $${paramCount}`);
            params.push(length);
            paramCount++;
        }

        if (color !== undefined) {
            updates.push(`color = $${paramCount}`);
            params.push(color);
            paramCount++;
        }

        if (price !== undefined) {
            updates.push(`price = $${paramCount}`);
            params.push(parseFloat(price));
            paramCount++;
        }

        if (stock !== undefined) {
            updates.push(`stock = $${paramCount}`);
            params.push(parseInt(stock));
            paramCount++;
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        updates.push(`updated_at = NOW()`);
        params.push(id);

        const updateQuery = `
            UPDATE product_variants
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await query(updateQuery, params);
        const variant = result.rows[0];

        // Log admin action
        await logAdminAction(
            req.admin.id,
            'update_variant',
            { 
                variant_id: id, 
                product_id: variantCheck.rows[0].product_id,
                product_name: variantCheck.rows[0].product_name,
                changes: req.body 
            },
            req.ip,
            req.get('user-agent')
        );

        res.json({
            success: true,
            message: 'Variant updated successfully',
            data: variant
        });

    } catch (error) {
        console.error('Update variant error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update variant'
        });
    }
};

/**
 * Delete product variant (ADMIN)
 * DELETE /api/admin/variants/:id
 */
const deleteVariant = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if variant exists
        const variantCheck = await query(
            `SELECT pv.*, p.name as product_name 
             FROM product_variants pv
             JOIN products p ON pv.product_id = p.id
             WHERE pv.id = $1`,
            [id]
        );
        if (variantCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Variant not found'
            });
        }

        const variant = variantCheck.rows[0];

        // Delete variant
        await query('DELETE FROM product_variants WHERE id = $1', [id]);

        // Log admin action
        await logAdminAction(
            req.admin.id,
            'delete_variant',
            { 
                variant_id: id,
                product_id: variant.product_id,
                product_name: variant.product_name,
                sku: variant.sku 
            },
            req.ip,
            req.get('user-agent')
        );

        res.json({
            success: true,
            message: 'Variant deleted successfully'
        });

    } catch (error) {
        console.error('Delete variant error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete variant'
        });
    }
};

/**
 * Search products with full-text search (PUBLIC)
 * GET /api/products/search
 */
const searchProducts = async (req, res) => {
    try {
        const {
            q, // search query
            category_id,
            price_min,
            price_max,
            page = 1,
            limit = 20
        } = req.query;

        if (!q || q.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        // Validate pagination
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        // Build WHERE conditions
        const conditions = ['p.active = true'];
        const params = [];
        let paramCount = 1;

        // Full-text search using search_vector
        // Clean and prepare search query - remove special characters that could cause issues
        const cleanQuery = q.trim()
            .replace(/[^\w\s]/g, ' ') // Remove special characters
            .split(/\s+/)
            .filter(term => term.length > 0)
            .join(' & '); // Join with AND operator for full-text search
        
        if (cleanQuery.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid search query'
            });
        }

        conditions.push(`p.search_vector @@ to_tsquery('english', $${paramCount})`);
        params.push(cleanQuery);
        paramCount++;

        // Filter by category
        if (category_id) {
            conditions.push(`p.category_id = $${paramCount}`);
            params.push(category_id);
            paramCount++;
        }

        // Filter by price range
        if (price_min) {
            conditions.push(`p.base_price >= $${paramCount}`);
            params.push(parseFloat(price_min));
            paramCount++;
        }

        if (price_max) {
            conditions.push(`p.base_price <= $${paramCount}`);
            params.push(parseFloat(price_max));
            paramCount++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Search products with ranking
        const productsQuery = `
            SELECT 
                p.*,
                c.name as category_name,
                ts_rank(p.search_vector, to_tsquery('english', $1)) as rank,
                COALESCE(
                    (SELECT AVG(rating) FROM product_reviews WHERE product_id = p.id AND is_approved = true),
                    0
                ) as average_rating,
                COALESCE(
                    (SELECT COUNT(*) FROM product_reviews WHERE product_id = p.id AND is_approved = true),
                    0
                ) as review_count
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            ${whereClause}
            ORDER BY rank DESC, p.created_at DESC
            LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;
        params.push(limitNum, offset);
        
        const productsResult = await query(productsQuery, params);

        // Get total count for pagination
        const countParams = params.slice(0, paramCount - 1);
        const countQuery = `
            SELECT COUNT(*) 
            FROM products p 
            ${whereClause}
        `;
        const countResult = await query(countQuery, countParams);
        const totalProducts = parseInt(countResult.rows[0].count);

        res.json({
            success: true,
            data: {
                query: q,
                products: productsResult.rows,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(totalProducts / limitNum),
                    totalProducts,
                    limit: limitNum
                }
            }
        });

    } catch (error) {
        console.error('Search products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search products. Please try again.'
        });
    }
};

module.exports = {
    // Public routes
    listProducts,
    getProduct,
    getProductVariants,
    searchProducts,
    // Admin routes
    createProduct,
    updateProduct,
    deleteProduct,
    createVariant,
    updateVariant,
    deleteVariant
};
