/**
 * Product Reviews Controller
 * Handles product reviews and ratings
 */

const { query } = require('../db/connection');

/**
 * Submit a new review (authenticated customers only)
 * POST /api/reviews
 */
const submitReview = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const { product_id, rating, title, review_text, order_id } = req.body;
        const userId = req.user.id;

        // Validate required fields
        if (!product_id || !rating || !title || !review_text) {
            return res.status(400).json({
                success: false,
                message: 'Product ID, rating, title, and review text are required'
            });
        }

        // Validate rating
        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        // Validate title length
        if (title.length > 200) {
            return res.status(400).json({
                success: false,
                message: 'Title must not exceed 200 characters'
            });
        }

        // Check if product exists
        const productResult = await query(
            'SELECT id FROM products WHERE id = $1',
            [product_id]
        );

        if (productResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if user has already reviewed this product
        const existingReview = await query(
            'SELECT id FROM product_reviews WHERE product_id = $1 AND user_id = $2',
            [product_id, userId]
        );

        if (existingReview.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'You have already reviewed this product'
            });
        }

        // Check if this is a verified purchase
        let isVerifiedPurchase = false;
        if (order_id) {
            const orderCheck = await query(
                `SELECT oi.id 
                 FROM order_items oi
                 JOIN orders o ON oi.order_id = o.id
                 WHERE o.id = $1 
                 AND o.user_id = $2 
                 AND oi.product_id = $3
                 AND o.status = 'completed'`,
                [order_id, userId, product_id]
            );
            isVerifiedPurchase = orderCheck.rows.length > 0;
        }

        // Insert review
        const result = await query(
            `INSERT INTO product_reviews 
             (product_id, user_id, order_id, rating, title, review_text, is_verified_purchase, is_approved)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, product_id, user_id, rating, title, review_text, is_verified_purchase, 
                       is_approved, helpful_count, created_at`,
            [product_id, userId, order_id, rating, title, review_text, isVerifiedPurchase, false]
        );

        res.status(201).json({
            success: true,
            message: 'Review submitted successfully. It will be visible after admin approval.',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Submit review error:', error);
        
        // Handle unique constraint violation
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'You have already reviewed this product'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to submit review. Please try again.'
        });
    }
};

/**
 * Get reviews for a product (public)
 * GET /api/reviews/product/:productId
 */
const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const { page = 1, limit = 10, sort = 'recent' } = req.query;

        const offset = (page - 1) * limit;
        
        // Determine sort order
        let orderBy = 'pr.created_at DESC'; // recent (default)
        const sortOptions = {
            'recent': 'pr.created_at DESC',
            'helpful': 'pr.helpful_count DESC, pr.created_at DESC',
            'rating_high': 'pr.rating DESC, pr.created_at DESC',
            'rating_low': 'pr.rating ASC, pr.created_at DESC'
        };
        
        if (sortOptions[sort]) {
            orderBy = sortOptions[sort];
        }

        // Get approved reviews only for public access
        const reviews = await query(
            `SELECT 
                pr.id, pr.rating, pr.title, pr.review_text, pr.is_verified_purchase,
                pr.helpful_count, pr.created_at,
                u.name as reviewer_name
             FROM product_reviews pr
             JOIN users u ON pr.user_id = u.id
             WHERE pr.product_id = $1 AND pr.is_approved = true
             ORDER BY ${orderBy}
             LIMIT $2 OFFSET $3`,
            [productId, limit, offset]
        );

        // Get total count
        const countResult = await query(
            'SELECT COUNT(*) FROM product_reviews WHERE product_id = $1 AND is_approved = true',
            [productId]
        );
        const totalReviews = parseInt(countResult.rows[0].count);

        // Get rating summary
        const summaryResult = await query(
            `SELECT 
                AVG(rating) as average_rating,
                COUNT(*) as total_reviews,
                COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
                COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
                COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
                COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
                COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
             FROM product_reviews
             WHERE product_id = $1 AND is_approved = true`,
            [productId]
        );

        res.json({
            success: true,
            data: {
                reviews: reviews.rows,
                summary: {
                    averageRating: parseFloat(summaryResult.rows[0].average_rating) || 0,
                    totalReviews: parseInt(summaryResult.rows[0].total_reviews) || 0,
                    ratingBreakdown: {
                        5: parseInt(summaryResult.rows[0].five_star) || 0,
                        4: parseInt(summaryResult.rows[0].four_star) || 0,
                        3: parseInt(summaryResult.rows[0].three_star) || 0,
                        2: parseInt(summaryResult.rows[0].two_star) || 0,
                        1: parseInt(summaryResult.rows[0].one_star) || 0
                    }
                },
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalReviews / limit),
                    totalReviews,
                    limit: parseInt(limit)
                }
            }
        });

    } catch (error) {
        console.error('Get product reviews error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch reviews. Please try again.'
        });
    }
};

/**
 * Update own review (authenticated)
 * PUT /api/reviews/:id
 */
const updateReview = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const { id } = req.params;
        const { rating, title, review_text } = req.body;
        const userId = req.user.id;

        // Verify review belongs to user
        const reviewCheck = await query(
            'SELECT id, user_id FROM product_reviews WHERE id = $1',
            [id]
        );

        if (reviewCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        if (reviewCheck.rows[0].user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You can only update your own reviews'
            });
        }

        // Validate rating if provided
        if (rating && (rating < 1 || rating > 5)) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        // Update review (will require re-approval)
        const result = await query(
            `UPDATE product_reviews
             SET rating = COALESCE($1, rating),
                 title = COALESCE($2, title),
                 review_text = COALESCE($3, review_text),
                 is_approved = false,
                 updated_at = NOW()
             WHERE id = $4
             RETURNING id, rating, title, review_text, is_approved, updated_at`,
            [rating, title, review_text, id]
        );

        res.json({
            success: true,
            message: 'Review updated successfully. It will be reviewed again before being published.',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Update review error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update review. Please try again.'
        });
    }
};

/**
 * Delete own review (authenticated)
 * DELETE /api/reviews/:id
 */
const deleteReview = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const { id } = req.params;
        const userId = req.user.id;

        // Verify review belongs to user
        const reviewCheck = await query(
            'SELECT id, user_id FROM product_reviews WHERE id = $1',
            [id]
        );

        if (reviewCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        if (reviewCheck.rows[0].user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own reviews'
            });
        }

        // Delete review
        await query('DELETE FROM product_reviews WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Review deleted successfully'
        });

    } catch (error) {
        console.error('Delete review error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete review. Please try again.'
        });
    }
};

/**
 * Mark review as helpful (public)
 * POST /api/reviews/:id/helpful
 */
const markHelpful = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if review exists
        const reviewCheck = await query(
            'SELECT id FROM product_reviews WHERE id = $1',
            [id]
        );

        if (reviewCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        // Increment helpful count
        const result = await query(
            `UPDATE product_reviews
             SET helpful_count = helpful_count + 1
             WHERE id = $1
             RETURNING helpful_count`,
            [id]
        );

        res.json({
            success: true,
            message: 'Thank you for your feedback',
            data: {
                helpful_count: result.rows[0].helpful_count
            }
        });

    } catch (error) {
        console.error('Mark helpful error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark review as helpful. Please try again.'
        });
    }
};

/**
 * Get all reviews for admin (admin only)
 * GET /api/admin/reviews
 */
const getAllReviews = async (req, res) => {
    try {
        const { page = 1, limit = 20, status = 'all' } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = '';
        if (status === 'pending') {
            whereClause = 'WHERE pr.is_approved = false';
        } else if (status === 'approved') {
            whereClause = 'WHERE pr.is_approved = true';
        }

        const reviews = await query(
            `SELECT 
                pr.id, pr.rating, pr.title, pr.review_text, pr.is_verified_purchase,
                pr.is_approved, pr.helpful_count, pr.created_at,
                u.name as reviewer_name, u.email as reviewer_email,
                p.name as product_name, p.id as product_id
             FROM product_reviews pr
             JOIN users u ON pr.user_id = u.id
             JOIN products p ON pr.product_id = p.id
             ${whereClause}
             ORDER BY pr.created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const countResult = await query(
            `SELECT COUNT(*) FROM product_reviews pr ${whereClause}`
        );
        const totalReviews = parseInt(countResult.rows[0].count);

        res.json({
            success: true,
            data: {
                reviews: reviews.rows,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalReviews / limit),
                    totalReviews,
                    limit: parseInt(limit)
                }
            }
        });

    } catch (error) {
        console.error('Get all reviews error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch reviews. Please try again.'
        });
    }
};

/**
 * Approve review (admin only)
 * PUT /api/admin/reviews/:id/approve
 */
const approveReview = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            `UPDATE product_reviews
             SET is_approved = true, updated_at = NOW()
             WHERE id = $1
             RETURNING id, is_approved`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        res.json({
            success: true,
            message: 'Review approved successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Approve review error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve review. Please try again.'
        });
    }
};

/**
 * Reject review (admin only)
 * PUT /api/admin/reviews/:id/reject
 */
const rejectReview = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM product_reviews WHERE id = $1 RETURNING id',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        res.json({
            success: true,
            message: 'Review rejected and deleted successfully'
        });

    } catch (error) {
        console.error('Reject review error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject review. Please try again.'
        });
    }
};

module.exports = {
    submitReview,
    getProductReviews,
    updateReview,
    deleteReview,
    markHelpful,
    getAllReviews,
    approveReview,
    rejectReview
};
