/**
 * Server-side Validation Middleware
 * Never trust frontend prices - always recalculate server-side
 */

const { query } = require('../db/connection');

/**
 * Validate and recalculate cart totals
 * CRITICAL: Never trust frontend prices
 */
const validateCartTotals = async (req, res, next) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart items are required'
            });
        }

        // Fetch real prices from database
        const variantIds = items.map(item => item.variant_id);
        const result = await query(
            `SELECT pv.id, pv.price, pv.stock, p.active, p.name, pv.texture, pv.length, pv.color
             FROM product_variants pv
             JOIN products p ON pv.product_id = p.id
             WHERE pv.id = ANY($1) AND p.active = true`,
            [variantIds]
        );

        const variants = {};
        result.rows.forEach(row => {
            variants[row.id] = row;
        });

        // Validate each item and recalculate totals
        let calculatedSubtotal = 0;
        const validatedItems = [];

        for (const item of items) {
            const variant = variants[item.variant_id];

            if (!variant) {
                return res.status(400).json({
                    success: false,
                    message: `Product variant ${item.variant_id} not found or inactive`
                });
            }

            // Check stock availability
            if (variant.stock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${variant.name}. Available: ${variant.stock}`
                });
            }

            // Validate quantity
            if (item.quantity < 1 || !Number.isInteger(item.quantity)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid quantity'
                });
            }

            // Calculate subtotal using database price (NEVER trust frontend)
            const itemSubtotal = parseFloat(variant.price) * item.quantity;
            calculatedSubtotal += itemSubtotal;

            validatedItems.push({
                variant_id: item.variant_id,
                quantity: item.quantity,
                price: parseFloat(variant.price),
                subtotal: itemSubtotal,
                name: variant.name,
                details: {
                    texture: variant.texture,
                    length: variant.length,
                    color: variant.color
                }
            });
        }

        // Attach validated data to request
        req.validatedCart = {
            items: validatedItems,
            subtotal: calculatedSubtotal
        };

        next();
    } catch (error) {
        console.error('Cart validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate cart'
        });
    }
};

/**
 * Validate order totals including discounts, taxes, and shipping
 */
const validateOrderTotals = async (req, res, next) => {
    try {
        const { discount_code, shipping_cost = 0 } = req.body;
        
        if (!req.validatedCart) {
            return res.status(400).json({
                success: false,
                message: 'Cart validation required first'
            });
        }

        let subtotal = req.validatedCart.subtotal;
        let discountAmount = 0;

        // Validate discount code if provided
        if (discount_code) {
            const discountResult = await query(
                `SELECT * FROM discounts 
                 WHERE code = $1 AND active = true 
                 AND (expires_at IS NULL OR expires_at > NOW())
                 AND (usage_limit IS NULL OR used_count < usage_limit)`,
                [discount_code]
            );

            if (discountResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired discount code'
                });
            }

            const discount = discountResult.rows[0];

            // Check minimum purchase requirement
            if (discount.min_purchase && subtotal < parseFloat(discount.min_purchase)) {
                return res.status(400).json({
                    success: false,
                    message: `Minimum purchase of R${discount.min_purchase} required for this discount`
                });
            }

            // Calculate discount amount
            if (discount.type === 'percentage') {
                discountAmount = (subtotal * parseFloat(discount.value)) / 100;
            } else if (discount.type === 'fixed') {
                discountAmount = parseFloat(discount.value);
            }

            // Ensure discount doesn't exceed subtotal
            discountAmount = Math.min(discountAmount, subtotal);
        }

        // Validate shipping cost
        const validatedShippingCost = parseFloat(shipping_cost) || 0;
        if (validatedShippingCost < 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid shipping cost'
            });
        }

        // Calculate tax (VAT in South Africa is 15%)
        const vatRate = parseFloat(process.env.VAT_RATE) || 0.15;
        const taxableAmount = subtotal - discountAmount;
        const tax = taxableAmount * vatRate;

        // Calculate total
        const total = taxableAmount + tax + validatedShippingCost;

        // Attach validated order totals to request
        req.validatedOrder = {
            subtotal: parseFloat(subtotal.toFixed(2)),
            discount_amount: parseFloat(discountAmount.toFixed(2)),
            discount_code: discount_code || null,
            shipping_cost: parseFloat(validatedShippingCost.toFixed(2)),
            tax: parseFloat(tax.toFixed(2)),
            total: parseFloat(total.toFixed(2)),
            items: req.validatedCart.items
        };

        next();
    } catch (error) {
        console.error('Order validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate order'
        });
    }
};

/**
 * Validate price format
 */
const validatePrice = (price) => {
    const priceNum = parseFloat(price);
    
    if (isNaN(priceNum) || priceNum < 0) {
        return false;
    }

    // Check for max 2 decimal places
    const decimalPart = price.toString().split('.')[1];
    if (decimalPart && decimalPart.length > 2) {
        return false;
    }

    return true;
};

/**
 * Validate quantity format
 */
const validateQuantity = (quantity) => {
    const quantityNum = parseInt(quantity);
    return Number.isInteger(quantityNum) && quantityNum > 0;
};

/**
 * Middleware to validate product prices on creation/update
 */
const validateProductPrice = (req, res, next) => {
    const { price, sale_price } = req.body;

    if (price !== undefined && !validatePrice(price)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid price format. Must be positive with max 2 decimal places.'
        });
    }

    if (sale_price !== undefined && sale_price !== null && !validatePrice(sale_price)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid sale price format. Must be positive with max 2 decimal places.'
        });
    }

    next();
};

/**
 * Middleware to validate cart item quantity
 */
const validateCartQuantity = (req, res, next) => {
    const { quantity } = req.body;

    if (!validateQuantity(quantity)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid quantity. Must be a positive integer.'
        });
    }

    next();
};

module.exports = {
    validateCartTotals,
    validateOrderTotals,
    validatePrice,
    validateQuantity,
    validateProductPrice,
    validateCartQuantity
};
