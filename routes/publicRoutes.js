/**
 * Public/Customer Routes
 * Non-authenticated and customer-authenticated routes
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db/connection');
const { validatePagination, validateProduct } = require('../middleware/validator');

// =====================================================
// CUSTOMER AUTHENTICATION
// =====================================================

/**
 * Customer registration
 */
router.post('/auth/register', async (req, res) => {
    try {
        const { email, password, full_name, phone } = req.body;
        
        // Validate required fields
        if (!email || !password || !full_name) {
            return res.status(400).json({
                success: false,
                message: 'Email, password, and full name are required'
            });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }
        
        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long'
            });
        }
        
        // Check if email already exists
        const existingCustomer = await query(
            'SELECT id FROM customers WHERE email = $1',
            [email.toLowerCase()]
        );
        
        if (existingCustomer.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }
        
        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);
        
        // Create customer
        const result = await query(
            `INSERT INTO customers (email, password_hash, full_name, phone)
             VALUES ($1, $2, $3, $4)
             RETURNING id, email, full_name, phone, created_at`,
            [email.toLowerCase(), passwordHash, full_name, phone || null]
        );
        
        const customer = result.rows[0];
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                id: customer.id,
                email: customer.email,
                type: 'customer'
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                token,
                customer: {
                    id: customer.id,
                    email: customer.email,
                    full_name: customer.full_name,
                    phone: customer.phone
                }
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.'
        });
    }
});

/**
 * Customer login
 */
router.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }
        
        // Find customer
        const result = await query(
            'SELECT * FROM customers WHERE email = $1',
            [email.toLowerCase()]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        const customer = result.rows[0];
        
        // Check if account is active
        if (!customer.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Account is disabled. Contact support.'
            });
        }
        
        // Verify password
        const isPasswordValid = await bcrypt.compare(password, customer.password_hash);
        
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                id: customer.id,
                email: customer.email,
                type: 'customer'
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        
        // Update last login
        await query(
            'UPDATE customers SET last_login = NOW() WHERE id = $1',
            [customer.id]
        );
        
        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                customer: {
                    id: customer.id,
                    email: customer.email,
                    full_name: customer.full_name,
                    phone: customer.phone
                }
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
});

/**
 * Get current customer info (requires authentication)
 */
router.get('/auth/user', authenticateCustomer, async (req, res) => {
    try {
        const result = await query(
            `SELECT id, email, full_name, phone, email_verified, is_active, created_at
             FROM customers WHERE id = $1`,
            [req.customer.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Get current customer error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch customer info'
        });
    }
});

// Simple customer authentication middleware (inline for now)
async function authenticateCustomer(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        
        const token = authHeader.substring(7);
        
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        if (decoded.type !== 'customer') {
            return res.status(403).json({
                success: false,
                message: 'Invalid token type'
            });
        }
        
        // Get customer
        const result = await query(
            'SELECT id, email, full_name FROM customers WHERE id = $1 AND is_active = true',
            [decoded.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
        
        req.customer = result.rows[0];
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
        
        console.error('Authentication error:', error);
        res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
}

// =====================================================
// PUBLIC PRODUCTS
// =====================================================

/**
 * Get all products (public) - with filters and search
 */
router.get('/products', validatePagination, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            category, 
            search, 
            min_price, 
            max_price,
            sort = 'created_at',
            order = 'desc'
        } = req.query;
        
        const offset = (page - 1) * limit;
        
        let whereClause = 'is_active = true';
        const params = [];
        let paramCount = 1;
        
        if (category) {
            whereClause += ` AND category = $${paramCount++}`;
            params.push(category);
        }
        
        if (search) {
            whereClause += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
            params.push(`%${search}%`);
            paramCount++;
        }
        
        if (min_price) {
            whereClause += ` AND price_incl_vat >= $${paramCount++}`;
            params.push(min_price);
        }
        
        if (max_price) {
            whereClause += ` AND price_incl_vat <= $${paramCount++}`;
            params.push(max_price);
        }
        
        // Validate sort field to prevent SQL injection
        const allowedSortFields = ['created_at', 'price_incl_vat', 'name', 'popularity'];
        const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
        
        const productsQuery = `
            SELECT id, name, description, category, base_price, price_incl_vat, 
                   stock_quantity, sku, is_featured, image_url, created_at
            FROM products 
            WHERE ${whereClause}
            ORDER BY ${sortField} ${sortOrder}
            LIMIT $${paramCount++} OFFSET $${paramCount}
        `;
        params.push(limit, offset);
        
        const products = await query(productsQuery, params);
        
        // Get total count for pagination
        const countQuery = `SELECT COUNT(*) as total FROM products WHERE ${whereClause}`;
        const countResult = await query(countQuery, params.slice(0, -2));
        
        res.json({
            success: true,
            data: products.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].total),
                pages: Math.ceil(countResult.rows[0].total / limit)
            }
        });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
});

/**
 * Get featured products
 */
router.get('/products/featured', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        const result = await query(
            `SELECT id, name, description, category, base_price, price_incl_vat, 
                    stock_quantity, sku, image_url, is_featured
             FROM products 
             WHERE is_featured = true AND is_active = true AND stock_quantity > 0
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit]
        );
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get featured products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch featured products'
        });
    }
});

/**
 * Search products
 */
router.get('/products/search', async (req, res) => {
    try {
        const { q, limit = 20 } = req.query;
        
        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters'
            });
        }
        
        const searchPattern = `%${q}%`;
        const result = await query(
            `SELECT id, name, description, category, price_incl_vat, image_url
             FROM products 
             WHERE (name ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)
             AND is_active = true
             ORDER BY 
                CASE 
                    WHEN name ILIKE $1 THEN 1
                    WHEN category ILIKE $1 THEN 2
                    ELSE 3
                END,
                name
             LIMIT $2`,
            [searchPattern, limit]
        );
        
        res.json({
            success: true,
            data: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Search products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search products'
        });
    }
});

/**
 * Get single product by ID
 */
router.get('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await query(
            `SELECT id, name, description, category, base_price, price_incl_vat, 
                    stock_quantity, sku, is_featured, image_url, created_at
             FROM products 
             WHERE id = $1 AND is_active = true`,
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product'
        });
    }
});

/**
 * Get product categories
 */
router.get('/categories', async (req, res) => {
    try {
        const result = await query(
            `SELECT DISTINCT category, COUNT(*) as product_count
             FROM products 
             WHERE is_active = true
             GROUP BY category
             ORDER BY category`
        );
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch categories'
        });
    }
});

// =====================================================
// ORDERS (Customer)
// =====================================================

/**
 * Create order (customer checkout)
 */
router.post('/orders', async (req, res) => {
    try {
        const {
            customer_email,
            customer_name,
            customer_phone,
            items,
            shipping_address,
            billing_address,
            discount_code
        } = req.body;
        
        // Validate required fields
        if (!customer_email || !customer_name || !items || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }
        
        // Calculate order totals
        let subtotal = 0;
        const orderItems = [];
        
        // Validate and calculate each item
        for (const item of items) {
            const product = await query(
                'SELECT id, name, price_incl_vat, stock_quantity FROM products WHERE id = $1 AND is_active = true',
                [item.product_id]
            );
            
            if (product.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: `Product ${item.product_id} not found`
                });
            }
            
            const productData = product.rows[0];
            
            if (productData.stock_quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${productData.name}`
                });
            }
            
            const itemTotal = productData.price_incl_vat * item.quantity;
            subtotal += itemTotal;
            
            orderItems.push({
                product_id: item.product_id,
                product_name: productData.name,
                quantity: item.quantity,
                unit_price: productData.price_incl_vat,
                total_price: itemTotal
            });
        }
        
        // Apply discount if provided
        let discount_amount = 0;
        if (discount_code) {
            const discountResult = await query(
                `SELECT * FROM discount_codes 
                 WHERE code = $1 
                 AND is_active = true 
                 AND (expires_at IS NULL OR expires_at > NOW())
                 AND (starts_at IS NULL OR starts_at <= NOW())`,
                [discount_code]
            );
            
            if (discountResult.rows.length > 0) {
                const discount = discountResult.rows[0];
                
                // Check usage limit
                if (discount.usage_limit && discount.times_used >= discount.usage_limit) {
                    // Discount code exhausted, but don't fail the order
                } else if (subtotal >= (discount.min_order_value || 0)) {
                    if (discount.discount_type === 'percentage') {
                        discount_amount = subtotal * (discount.discount_value / 100);
                    } else {
                        discount_amount = discount.discount_value;
                    }
                    
                    if (discount.max_discount_amount && discount_amount > discount.max_discount_amount) {
                        discount_amount = discount.max_discount_amount;
                    }
                }
            }
        }
        
        const total_amount = subtotal - discount_amount;
        const vat_rate = parseFloat(process.env.VAT_RATE) || 0.15;
        const vat_amount = total_amount - (total_amount / (1 + vat_rate));
        
        // Generate order number
        const orderNumber = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11).toUpperCase();
        
        // Create order
        const orderResult = await query(
            `INSERT INTO orders 
             (order_number, customer_email, customer_name, customer_phone, 
              subtotal, discount_amount, vat_amount, total_amount,
              shipping_address, billing_address, status, payment_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [orderNumber, customer_email, customer_name, customer_phone,
             subtotal, discount_amount, vat_amount, total_amount,
             JSON.stringify(shipping_address), JSON.stringify(billing_address),
             'pending', 'pending']
        );
        
        const order = orderResult.rows[0];
        
        // Insert order items
        for (const item of orderItems) {
            await query(
                `INSERT INTO order_items 
                 (order_id, product_id, product_name, quantity, unit_price, total_price)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [order.id, item.product_id, item.product_name, item.quantity, item.unit_price, item.total_price]
            );
            
            // Decrement stock
            await query(
                'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
                [item.quantity, item.product_id]
            );
        }
        
        // Update discount code usage
        if (discount_code && discount_amount > 0) {
            await query(
                'UPDATE discount_codes SET times_used = times_used + 1 WHERE code = $1',
                [discount_code]
            );
        }
        
        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: {
                order_id: order.id,
                order_number: order.order_number,
                total_amount: order.total_amount,
                items: orderItems
            }
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order'
        });
    }
});

/**
 * Track order by order number
 */
router.get('/orders/track/:orderNumber', async (req, res) => {
    try {
        const { orderNumber } = req.params;
        
        const orderResult = await query(
            `SELECT id, order_number, customer_name, total_amount, status, 
                    payment_status, placed_at, shipped_at, delivered_at
             FROM orders 
             WHERE order_number = $1`,
            [orderNumber]
        );
        
        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        const order = orderResult.rows[0];
        
        // Get order items
        const itemsResult = await query(
            'SELECT product_name, quantity, unit_price, total_price FROM order_items WHERE order_id = $1',
            [order.id]
        );
        
        res.json({
            success: true,
            data: {
                ...order,
                items: itemsResult.rows
            }
        });
    } catch (error) {
        console.error('Track order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to track order'
        });
    }
});

// =====================================================
// CONTACT & NEWSLETTER
// =====================================================

/**
 * Contact form submission
 */
router.post('/contact', async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;
        
        if (!name || !email || !message) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and message are required'
            });
        }
        
        // Store contact submission
        await query(
            `INSERT INTO contact_submissions (name, email, phone, subject, message)
             VALUES ($1, $2, $3, $4, $5)`,
            [name, email, phone || null, subject || 'General Inquiry', message]
        );
        
        // TODO: Send email notification to support team
        
        res.status(201).json({
            success: true,
            message: 'Thank you for contacting us. We will respond shortly.'
        });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit contact form'
        });
    }
});

/**
 * Newsletter subscription
 */
router.post('/newsletter', async (req, res) => {
    try {
        const { email, name } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }
        
        // Check if already subscribed
        const existing = await query(
            'SELECT id FROM newsletter_subscribers WHERE email = $1',
            [email]
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email already subscribed'
            });
        }
        
        // Add subscriber
        await query(
            `INSERT INTO newsletter_subscribers (email, name, subscribed_at)
             VALUES ($1, $2, NOW())`,
            [email, name || null]
        );
        
        res.status(201).json({
            success: true,
            message: 'Successfully subscribed to newsletter'
        });
    } catch (error) {
        console.error('Newsletter subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to subscribe to newsletter'
        });
    }
});

/**
 * Apply discount code (validate before checkout)
 */
router.post('/discount/validate', async (req, res) => {
    try {
        const { code, order_amount } = req.body;
        
        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Discount code is required'
            });
        }
        
        const result = await query(
            `SELECT * FROM discount_codes 
             WHERE code = $1 
             AND is_active = true 
             AND (expires_at IS NULL OR expires_at > NOW())
             AND (starts_at IS NULL OR starts_at <= NOW())`,
            [code]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Invalid or expired discount code'
            });
        }
        
        const discount = result.rows[0];
        
        // Check usage limit
        if (discount.usage_limit && discount.times_used >= discount.usage_limit) {
            return res.status(400).json({
                success: false,
                message: 'Discount code has reached usage limit'
            });
        }
        
        // Check minimum order value
        if (order_amount < (discount.min_order_value || 0)) {
            return res.status(400).json({
                success: false,
                message: `Minimum order value of R${discount.min_order_value} required`
            });
        }
        
        // Calculate discount amount
        let discount_amount = 0;
        if (discount.discount_type === 'percentage') {
            discount_amount = order_amount * (discount.discount_value / 100);
        } else {
            discount_amount = discount.discount_value;
        }
        
        if (discount.max_discount_amount && discount_amount > discount.max_discount_amount) {
            discount_amount = discount.max_discount_amount;
        }
        
        res.json({
            success: true,
            data: {
                code: discount.code,
                description: discount.description,
                discount_type: discount.discount_type,
                discount_value: discount.discount_value,
                discount_amount: discount_amount,
                final_amount: order_amount - discount_amount
            }
        });
    } catch (error) {
        console.error('Validate discount error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate discount code'
        });
    }
});

// =====================================================
// WISHLIST (Customer)
// =====================================================

/**
 * Get customer wishlist (requires authentication)
 */
router.get('/wishlist', authenticateCustomer, async (req, res) => {
    try {
        const result = await query(
            `SELECT w.id, w.product_id, w.added_at,
                    p.name, p.description, p.price_incl_vat, p.image_url, p.stock_quantity
             FROM wishlist w
             JOIN products p ON w.product_id = p.id
             WHERE w.customer_id = $1 AND p.is_active = true
             ORDER BY w.added_at DESC`,
            [req.customer.id]
        );
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get wishlist error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch wishlist'
        });
    }
});

/**
 * Add product to wishlist (requires authentication)
 */
router.post('/wishlist', authenticateCustomer, async (req, res) => {
    try {
        const { product_id } = req.body;
        
        if (!product_id) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }
        
        // Check if product exists
        const productResult = await query(
            'SELECT id FROM products WHERE id = $1 AND is_active = true',
            [product_id]
        );
        
        if (productResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        // Check if already in wishlist
        const existingResult = await query(
            'SELECT id FROM wishlist WHERE customer_id = $1 AND product_id = $2',
            [req.customer.id, product_id]
        );
        
        if (existingResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Product already in wishlist'
            });
        }
        
        // Add to wishlist
        const result = await query(
            `INSERT INTO wishlist (customer_id, product_id)
             VALUES ($1, $2)
             RETURNING id, product_id, added_at`,
            [req.customer.id, product_id]
        );
        
        res.status(201).json({
            success: true,
            message: 'Product added to wishlist',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Add to wishlist error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add to wishlist'
        });
    }
});

/**
 * Remove product from wishlist (requires authentication)
 */
router.delete('/wishlist/:id', authenticateCustomer, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Delete wishlist item (only if it belongs to the current customer)
        const result = await query(
            'DELETE FROM wishlist WHERE id = $1 AND customer_id = $2 RETURNING id',
            [id, req.customer.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist item not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Product removed from wishlist'
        });
    } catch (error) {
        console.error('Remove from wishlist error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove from wishlist'
        });
    }
});

module.exports = router;
