/**
 * Input Validation Middleware
 * Uses express-validator for input sanitization and validation
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(err => ({
                field: err.param,
                message: err.msg
            }))
        });
    }
    
    next();
};

/**
 * Login validation rules
 */
const validateLogin = [
    body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters'),
    handleValidationErrors
];

/**
 * Product validation rules
 */
const validateProduct = [
    body('name')
        .trim()
        .isLength({ min: 3, max: 255 })
        .withMessage('Product name must be between 3 and 255 characters'),
    body('description')
        .optional()
        .trim(),
    body('category')
        .isIn(['wigs', 'extensions', 'accessories'])
        .withMessage('Invalid category'),
    body('base_price')
        .isFloat({ min: 0 })
        .withMessage('Base price must be a positive number'),
    body('stock_quantity')
        .isInt({ min: 0 })
        .withMessage('Stock quantity must be a non-negative integer'),
    handleValidationErrors
];

/**
 * Order update validation rules
 */
const validateOrderUpdate = [
    body('status')
        .optional()
        .isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
        .withMessage('Invalid order status'),
    body('fulfillment_status')
        .optional()
        .isIn(['unfulfilled', 'fulfilled', 'partially_fulfilled'])
        .withMessage('Invalid fulfillment status'),
    body('tracking_number')
        .optional()
        .trim()
        .isLength({ max: 100 }),
    handleValidationErrors
];

/**
 * Discount code validation rules
 */
const validateDiscountCode = [
    body('code')
        .trim()
        .isLength({ min: 3, max: 50 })
        .matches(/^[A-Z0-9_-]+$/)
        .withMessage('Code must be 3-50 characters, uppercase letters, numbers, hyphens, and underscores only'),
    body('discount_type')
        .isIn(['percentage', 'fixed'])
        .withMessage('Discount type must be percentage or fixed'),
    body('discount_value')
        .isFloat({ min: 0 })
        .withMessage('Discount value must be a positive number'),
    body('usage_limit')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Usage limit must be at least 1'),
    handleValidationErrors
];

/**
 * Customer validation rules
 */
const validateCustomer = [
    body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    body('full_name')
        .trim()
        .isLength({ min: 2, max: 255 })
        .withMessage('Full name must be between 2 and 255 characters'),
    body('phone')
        .optional()
        .trim()
        .matches(/^[+]?[0-9\s()-]+$/)
        .withMessage('Invalid phone number format'),
    handleValidationErrors
];

/**
 * UUID parameter validation
 */
const validateUUID = (paramName = 'id') => [
    param(paramName)
        .isUUID()
        .withMessage(`Invalid ${paramName} format`),
    handleValidationErrors
];

/**
 * Pagination validation
 */
const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    handleValidationErrors
];

module.exports = {
    handleValidationErrors,
    validateLogin,
    validateProduct,
    validateOrderUpdate,
    validateDiscountCode,
    validateCustomer,
    validateUUID,
    validatePagination
};
