/**
 * Cart Controller
 * Handles cart management for both authenticated users and guest users
 */

const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/connection');

/**
 * Helper function to get or create cart
 */
const getOrCreateCart = async (userId, sessionId) => {
    let cartResult;
    
    if (userId) {
        // For authenticated users
        cartResult = await query(
            'SELECT id FROM carts WHERE user_id = $1',
            [userId]
        );
        
        if (cartResult.rows.length === 0) {
            cartResult = await query(
                'INSERT INTO carts (user_id) VALUES ($1) RETURNING id',
                [userId]
            );
        }
    } else {
        // For guest users
        if (!sessionId) {
            sessionId = uuidv4();
        }
        
        cartResult = await query(
            'SELECT id FROM carts WHERE session_id = $1',
            [sessionId]
        );
        
        if (cartResult.rows.length === 0) {
            cartResult = await query(
                'INSERT INTO carts (session_id) VALUES ($1) RETURNING id',
                [sessionId]
            );
        }
    }
    
    return { cartId: cartResult.rows[0].id, sessionId };
};

/**
 * Helper function to get cart identifier (user_id or session_id)
 */
const getCartIdentifier = (req) => {
    const userId = req.user?.id || null;
    const sessionId = req.headers['x-session-id'] || req.cookies?.session_id || null;
    return { userId, sessionId };
};

/**
 * Get cart items
 * GET /api/cart
 */
const getCart = async (req, res) => {
    try {
        const { userId, sessionId } = getCartIdentifier(req);
        
        if (!userId && !sessionId) {
            return res.status(200).json({
                success: true,
                data: {
                    items: [],
                    subtotal: 0,
                    total_items: 0,
                    session_id: uuidv4()
                }
            });
        }
        
        // Get cart with items
        const cartQuery = userId
            ? 'SELECT c.id, c.session_id FROM carts c WHERE c.user_id = $1'
            : 'SELECT c.id, c.session_id FROM carts c WHERE c.session_id = $1';
        
        const cartResult = await query(cartQuery, [userId || sessionId]);
        
        if (cartResult.rows.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    items: [],
                    subtotal: 0,
                    total_items: 0,
                    session_id: sessionId || uuidv4()
                }
            });
        }
        
        const cart = cartResult.rows[0];
        
        // Get cart items with product details
        const itemsResult = await query(
            `SELECT 
                ci.id,
                ci.variant_id,
                ci.quantity,
                p.id as product_id,
                p.name,
                p.description,
                p.category,
                pv.price,
                pv.sale_price,
                pv.stock,
                pv.sku,
                pv.texture,
                pv.length,
                pv.color,
                COALESCE(
                    (SELECT image_url FROM product_images 
                     WHERE product_id = p.id AND is_primary = true 
                     LIMIT 1),
                    (SELECT image_url FROM product_images 
                     WHERE product_id = p.id 
                     ORDER BY display_order 
                     LIMIT 1)
                ) as image_url
            FROM cart_items ci
            JOIN product_variants pv ON ci.variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            WHERE ci.cart_id = $1 AND p.active = true
            ORDER BY ci.added_at DESC`,
            [cart.id]
        );
        
        // Calculate totals
        let subtotal = 0;
        const items = itemsResult.rows.map(item => {
            const price = item.sale_price || item.price;
            const itemTotal = parseFloat(price) * item.quantity;
            subtotal += itemTotal;
            
            return {
                id: item.id,
                variant_id: item.variant_id,
                product_id: item.product_id,
                name: item.name,
                description: item.description,
                category: item.category,
                price: parseFloat(price),
                original_price: parseFloat(item.price),
                quantity: item.quantity,
                stock: item.stock,
                sku: item.sku,
                variant_details: {
                    texture: item.texture,
                    length: item.length,
                    color: item.color
                },
                image_url: item.image_url,
                item_total: parseFloat(itemTotal.toFixed(2))
            };
        });
        
        res.status(200).json({
            success: true,
            data: {
                items,
                subtotal: parseFloat(subtotal.toFixed(2)),
                total_items: items.length,
                session_id: cart.session_id || sessionId
            }
        });
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve cart'
        });
    }
};

/**
 * Add item to cart
 * POST /api/cart
 */
const addToCart = async (req, res) => {
    try {
        const { variant_id, quantity } = req.body;
        
        // Validate required fields
        if (!variant_id || !quantity) {
            return res.status(400).json({
                success: false,
                message: 'variant_id and quantity are required'
            });
        }
        
        // Validate quantity
        if (!Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be a positive integer'
            });
        }
        
        const { userId, sessionId } = getCartIdentifier(req);
        
        // Verify product variant exists and check stock
        const variantResult = await query(
            `SELECT pv.id, pv.stock, pv.price, pv.sale_price, p.name, p.active
             FROM product_variants pv
             JOIN products p ON pv.product_id = p.id
             WHERE pv.id = $1`,
            [variant_id]
        );
        
        if (variantResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product variant not found'
            });
        }
        
        const variant = variantResult.rows[0];
        
        if (!variant.active) {
            return res.status(400).json({
                success: false,
                message: 'Product is not available'
            });
        }
        
        if (variant.stock < quantity) {
            return res.status(400).json({
                success: false,
                message: `Insufficient stock. Only ${variant.stock} available`
            });
        }
        
        // Get or create cart
        const { cartId, sessionId: newSessionId } = await getOrCreateCart(userId, sessionId);
        
        // Check if item already exists in cart
        const existingItemResult = await query(
            'SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND variant_id = $2',
            [cartId, variant_id]
        );
        
        if (existingItemResult.rows.length > 0) {
            // Update quantity
            const existingItem = existingItemResult.rows[0];
            const newQuantity = existingItem.quantity + quantity;
            
            // Check stock for new total quantity
            if (variant.stock < newQuantity) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot add ${quantity} more. Only ${variant.stock - existingItem.quantity} additional units available`
                });
            }
            
            await query(
                'UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [newQuantity, existingItem.id]
            );
        } else {
            // Insert new item
            await query(
                'INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, $3)',
                [cartId, variant_id, quantity]
            );
        }
        
        // Update cart timestamp
        await query(
            'UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [cartId]
        );
        
        // Return updated cart
        req.user = userId ? { id: userId } : null;
        req.headers['x-session-id'] = newSessionId;
        req.cookies = { ...req.cookies, session_id: newSessionId };
        
        return getCart(req, res);
    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add item to cart'
        });
    }
};

/**
 * Update cart item quantity
 * PUT /api/cart/:itemId
 */
const updateCartItem = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { quantity } = req.body;
        
        // Validate quantity
        if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 0)) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be a non-negative integer'
            });
        }
        
        const { userId, sessionId } = getCartIdentifier(req);
        
        if (!userId && !sessionId) {
            return res.status(400).json({
                success: false,
                message: 'Session required'
            });
        }
        
        // Verify item belongs to user's cart
        const cartQuery = userId
            ? `SELECT ci.id, ci.variant_id, ci.cart_id 
               FROM cart_items ci
               JOIN carts c ON ci.cart_id = c.id
               WHERE ci.id = $1 AND c.user_id = $2`
            : `SELECT ci.id, ci.variant_id, ci.cart_id 
               FROM cart_items ci
               JOIN carts c ON ci.cart_id = c.id
               WHERE ci.id = $1 AND c.session_id = $2`;
        
        const itemResult = await query(cartQuery, [itemId, userId || sessionId]);
        
        if (itemResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Cart item not found'
            });
        }
        
        const item = itemResult.rows[0];
        
        // If quantity is 0, remove item
        if (quantity === 0) {
            await query('DELETE FROM cart_items WHERE id = $1', [itemId]);
            await query(
                'UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [item.cart_id]
            );
            return getCart(req, res);
        }
        
        // Check stock availability
        const variantResult = await query(
            'SELECT stock FROM product_variants WHERE id = $1',
            [item.variant_id]
        );
        
        if (variantResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product variant not found'
            });
        }
        
        const variant = variantResult.rows[0];
        
        if (variant.stock < quantity) {
            return res.status(400).json({
                success: false,
                message: `Insufficient stock. Only ${variant.stock} available`
            });
        }
        
        // Update quantity
        await query(
            'UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [quantity, itemId]
        );
        
        // Update cart timestamp
        await query(
            'UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [item.cart_id]
        );
        
        // Return updated cart
        return getCart(req, res);
    } catch (error) {
        console.error('Update cart item error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update cart item'
        });
    }
};

/**
 * Remove item from cart
 * DELETE /api/cart/:itemId
 */
const removeCartItem = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { userId, sessionId } = getCartIdentifier(req);
        
        if (!userId && !sessionId) {
            return res.status(400).json({
                success: false,
                message: 'Session required'
            });
        }
        
        // Verify item belongs to user's cart
        const cartQuery = userId
            ? `SELECT ci.id, ci.cart_id 
               FROM cart_items ci
               JOIN carts c ON ci.cart_id = c.id
               WHERE ci.id = $1 AND c.user_id = $2`
            : `SELECT ci.id, ci.cart_id 
               FROM cart_items ci
               JOIN carts c ON ci.cart_id = c.id
               WHERE ci.id = $1 AND c.session_id = $2`;
        
        const itemResult = await query(cartQuery, [itemId, userId || sessionId]);
        
        if (itemResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Cart item not found'
            });
        }
        
        const item = itemResult.rows[0];
        
        // Delete item
        await query('DELETE FROM cart_items WHERE id = $1', [itemId]);
        
        // Update cart timestamp
        await query(
            'UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [item.cart_id]
        );
        
        // Return updated cart
        return getCart(req, res);
    } catch (error) {
        console.error('Remove cart item error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove cart item'
        });
    }
};

/**
 * Clear all cart items
 * DELETE /api/cart
 */
const clearCart = async (req, res) => {
    try {
        const { userId, sessionId } = getCartIdentifier(req);
        
        if (!userId && !sessionId) {
            return res.status(400).json({
                success: false,
                message: 'Session required'
            });
        }
        
        // Get cart
        const cartQuery = userId
            ? 'SELECT id FROM carts WHERE user_id = $1'
            : 'SELECT id FROM carts WHERE session_id = $1';
        
        const cartResult = await query(cartQuery, [userId || sessionId]);
        
        if (cartResult.rows.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Cart is already empty',
                data: {
                    items: [],
                    subtotal: 0,
                    total_items: 0
                }
            });
        }
        
        const cartId = cartResult.rows[0].id;
        
        // Delete all items
        await query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
        
        // Update cart timestamp
        await query(
            'UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [cartId]
        );
        
        res.status(200).json({
            success: true,
            message: 'Cart cleared successfully',
            data: {
                items: [],
                subtotal: 0,
                total_items: 0
            }
        });
    } catch (error) {
        console.error('Clear cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear cart'
        });
    }
};

/**
 * Validate cart - Server-side validation
 * POST /api/cart/validate
 */
const validateCart = async (req, res) => {
    try {
        const { userId, sessionId } = getCartIdentifier(req);
        
        if (!userId && !sessionId) {
            return res.status(400).json({
                success: false,
                message: 'Session required',
                validation: {
                    valid: false,
                    errors: ['Session required']
                }
            });
        }
        
        // Get cart
        const cartQuery = userId
            ? 'SELECT id FROM carts WHERE user_id = $1'
            : 'SELECT id FROM carts WHERE session_id = $1';
        
        const cartResult = await query(cartQuery, [userId || sessionId]);
        
        if (cartResult.rows.length === 0) {
            return res.status(200).json({
                success: true,
                validation: {
                    valid: false,
                    errors: ['Cart is empty']
                }
            });
        }
        
        const cartId = cartResult.rows[0].id;
        
        // Get cart items with product details
        const itemsResult = await query(
            `SELECT 
                ci.id,
                ci.variant_id,
                ci.quantity,
                p.name,
                p.active,
                pv.price,
                pv.sale_price,
                pv.stock,
                pv.texture,
                pv.length,
                pv.color
            FROM cart_items ci
            JOIN product_variants pv ON ci.variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            WHERE ci.cart_id = $1`,
            [cartId]
        );
        
        if (itemsResult.rows.length === 0) {
            return res.status(200).json({
                success: true,
                validation: {
                    valid: false,
                    errors: ['Cart is empty']
                }
            });
        }
        
        const errors = [];
        const warnings = [];
        let subtotal = 0;
        const validatedItems = [];
        
        for (const item of itemsResult.rows) {
            const price = item.sale_price || item.price;
            const itemTotal = parseFloat(price) * item.quantity;
            
            // Check if product is active
            if (!item.active) {
                errors.push(`${item.name} is no longer available`);
                continue;
            }
            
            // Check stock availability
            if (item.stock < item.quantity) {
                if (item.stock === 0) {
                    errors.push(`${item.name} is out of stock`);
                } else {
                    warnings.push(`${item.name}: Only ${item.stock} available (requested ${item.quantity})`);
                }
            }
            
            subtotal += itemTotal;
            
            validatedItems.push({
                id: item.id,
                variant_id: item.variant_id,
                name: item.name,
                quantity: item.quantity,
                price: parseFloat(price),
                stock_available: item.stock,
                variant_details: {
                    texture: item.texture,
                    length: item.length,
                    color: item.color
                },
                item_total: parseFloat(itemTotal.toFixed(2))
            });
        }
        
        const isValid = errors.length === 0;
        
        res.status(200).json({
            success: true,
            validation: {
                valid: isValid,
                errors: errors.length > 0 ? errors : undefined,
                warnings: warnings.length > 0 ? warnings : undefined
            },
            data: {
                items: validatedItems,
                subtotal: parseFloat(subtotal.toFixed(2)),
                total_items: validatedItems.length
            }
        });
    } catch (error) {
        console.error('Validate cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate cart'
        });
    }
};

module.exports = {
    getCart,
    addToCart,
    updateCartItem,
    removeCartItem,
    clearCart,
    validateCart
};
