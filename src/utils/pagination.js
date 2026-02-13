/**
 * Pagination utility helper for consistent pagination across API endpoints
 */

/**
 * Calculate pagination parameters
 * @param {number} page - Page number (1-based)
 * @param {number} limit - Items per page
 * @returns {Object} Pagination parameters with offset, limit, and page
 */
function paginate(page = 1, limit = 20) {
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const offset = (parsedPage - 1) * parsedLimit;
    
    return {
        limit: parsedLimit,
        offset,
        page: parsedPage
    };
}

/**
 * Build pagination metadata for response
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 * @returns {Object} Pagination metadata
 */
function buildPaginationMeta(page, limit, total) {
    const totalPages = Math.ceil(total / limit);
    
    return {
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    };
}

/**
 * Extract pagination params from request query
 * @param {Object} query - Express request query object
 * @returns {Object} Pagination parameters
 */
function getPaginationParams(query) {
    const { page, limit } = query;
    return paginate(page, limit);
}

module.exports = {
    paginate,
    buildPaginationMeta,
    getPaginationParams
};
