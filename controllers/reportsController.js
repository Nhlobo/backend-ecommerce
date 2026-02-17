/**
 * Reports Controller
 * Handles analytics and reporting for admins
 */

const { query } = require('../db/connection');

// =====================================================
// ADMIN ROUTES - ALL REQUIRE ADMIN AUTH
// =====================================================

/**
 * Get sales report by date range
 * GET /api/admin/reports/sales
 */
const getSalesReport = async (req, res) => {
    try {
        if (!req.admin || !req.admin.id) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }

        const { date_from, date_to } = req.query;

        if (!date_from || !date_to) {
            return res.status(400).json({
                success: false,
                message: 'date_from and date_to are required'
            });
        }

        // Validate date format
        const fromDate = new Date(date_from);
        const toDate = new Date(date_to);

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)'
            });
        }

        if (fromDate > toDate) {
            return res.status(400).json({
                success: false,
                message: 'date_from cannot be after date_to'
            });
        }

        // Get sales statistics
        const result = await query(
            `SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total_amount), 0) as total_revenue,
                COALESCE(AVG(total_amount), 0) as avg_order_value,
                COUNT(DISTINCT user_id) as unique_customers
             FROM orders
             WHERE created_at >= $1 AND created_at <= $2
             AND status NOT IN ('cancelled', 'failed')`,
            [date_from, date_to]
        );

        const stats = result.rows[0];

        // Get daily breakdown
        const dailyResult = await query(
            `SELECT 
                DATE(created_at) as date,
                COUNT(*) as orders,
                COALESCE(SUM(total_amount), 0) as revenue
             FROM orders
             WHERE created_at >= $1 AND created_at <= $2
             AND status NOT IN ('cancelled', 'failed')
             GROUP BY DATE(created_at)
             ORDER BY date ASC`,
            [date_from, date_to]
        );

        // Get status breakdown
        const statusResult = await query(
            `SELECT 
                status,
                COUNT(*) as count,
                COALESCE(SUM(total_amount), 0) as total
             FROM orders
             WHERE created_at >= $1 AND created_at <= $2
             GROUP BY status
             ORDER BY count DESC`,
            [date_from, date_to]
        );

        res.json({
            success: true,
            data: {
                summary: {
                    total_orders: parseInt(stats.total_orders),
                    total_revenue: parseFloat(stats.total_revenue),
                    avg_order_value: parseFloat(stats.avg_order_value),
                    unique_customers: parseInt(stats.unique_customers)
                },
                daily_breakdown: dailyResult.rows.map(row => ({
                    date: row.date,
                    orders: parseInt(row.orders),
                    revenue: parseFloat(row.revenue)
                })),
                status_breakdown: statusResult.rows.map(row => ({
                    status: row.status,
                    count: parseInt(row.count),
                    total: parseFloat(row.total)
                })),
                period: {
                    from: date_from,
                    to: date_to
                }
            }
        });
    } catch (error) {
        console.error('Get sales report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate sales report'
        });
    }
};

/**
 * Get product performance report
 * GET /api/admin/reports/products
 */
const getProductPerformance = async (req, res) => {
    try {
        if (!req.admin || !req.admin.id) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }

        const {
            date_from,
            date_to,
            limit = 50,
            sort = 'revenue',
            order = 'DESC'
        } = req.query;

        // Validate pagination
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

        // Validate sort field
        const validSortFields = ['revenue', 'units_sold', 'orders_count'];
        const sortField = validSortFields.includes(sort) ? sort : 'revenue';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Build WHERE clause
        const conditions = ["o.status NOT IN ('cancelled', 'failed')"];
        const params = [];
        let paramCount = 1;

        if (date_from) {
            conditions.push(`o.created_at >= $${paramCount}`);
            params.push(date_from);
            paramCount++;
        }

        if (date_to) {
            conditions.push(`o.created_at <= $${paramCount}`);
            params.push(date_to);
            paramCount++;
        }

        const whereClause = conditions.join(' AND ');

        // Get product performance
        params.push(limitNum);
        const result = await query(
            `SELECT 
                p.id as product_id,
                p.name as product_name,
                p.sku,
                COUNT(DISTINCT o.id) as orders_count,
                SUM(oi.quantity) as units_sold,
                COALESCE(SUM(oi.quantity * oi.price), 0) as revenue
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             JOIN product_variants pv ON oi.variant_id = pv.id
             JOIN products p ON pv.product_id = p.id
             WHERE ${whereClause}
             GROUP BY p.id, p.name, p.sku
             ORDER BY ${sortField} ${sortOrder}
             LIMIT $${paramCount}`,
            params
        );

        res.json({
            success: true,
            data: result.rows.map(row => ({
                product_id: row.product_id,
                product_name: row.product_name,
                sku: row.sku,
                orders_count: parseInt(row.orders_count),
                units_sold: parseInt(row.units_sold),
                revenue: parseFloat(row.revenue),
                avg_price: parseFloat((row.revenue / row.units_sold).toFixed(2))
            })),
            filters: {
                date_from: date_from || null,
                date_to: date_to || null,
                sort: sortField,
                order: sortOrder,
                limit: limitNum
            }
        });
    } catch (error) {
        console.error('Get product performance error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate product performance report'
        });
    }
};

/**
 * Get revenue analytics with trends
 * GET /api/admin/reports/revenue
 */
const getRevenueAnalytics = async (req, res) => {
    try {
        if (!req.admin || !req.admin.id) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }

        const { period = 'daily', date_from, date_to } = req.query;

        // Validate period
        const validPeriods = ['daily', 'weekly', 'monthly'];
        if (!validPeriods.includes(period)) {
            return res.status(400).json({
                success: false,
                message: `Period must be one of: ${validPeriods.join(', ')}`
            });
        }

        // Build WHERE clause
        const conditions = ["status NOT IN ('cancelled', 'failed')"];
        const params = [];
        let paramCount = 1;

        if (date_from) {
            conditions.push(`created_at >= $${paramCount}`);
            params.push(date_from);
            paramCount++;
        }

        if (date_to) {
            conditions.push(`created_at <= $${paramCount}`);
            params.push(date_to);
            paramCount++;
        }

        const whereClause = conditions.join(' AND ');

        // Select appropriate date truncation based on period
        let dateGroup;
        if (period === 'daily') {
            dateGroup = 'DATE(created_at)';
        } else if (period === 'weekly') {
            dateGroup = 'DATE_TRUNC(\'week\', created_at)';
        } else {
            dateGroup = 'DATE_TRUNC(\'month\', created_at)';
        }

        // Get revenue trends
        const result = await query(
            `SELECT 
                ${dateGroup} as period,
                COUNT(*) as orders,
                COALESCE(SUM(total_amount), 0) as revenue,
                COALESCE(AVG(total_amount), 0) as avg_order_value,
                COUNT(DISTINCT user_id) as unique_customers
             FROM orders
             WHERE ${whereClause}
             GROUP BY ${dateGroup}
             ORDER BY period ASC`,
            params
        );

        // Calculate growth rates
        const trends = result.rows.map((row, index) => {
            let growth_rate = null;
            if (index > 0) {
                const prevRevenue = parseFloat(result.rows[index - 1].revenue);
                const currentRevenue = parseFloat(row.revenue);
                if (prevRevenue > 0) {
                    growth_rate = ((currentRevenue - prevRevenue) / prevRevenue * 100).toFixed(2);
                }
            }

            return {
                period: row.period,
                orders: parseInt(row.orders),
                revenue: parseFloat(row.revenue),
                avg_order_value: parseFloat(row.avg_order_value),
                unique_customers: parseInt(row.unique_customers),
                growth_rate: growth_rate ? parseFloat(growth_rate) : null
            };
        });

        // Calculate overall statistics
        const totalRevenue = trends.reduce((sum, t) => sum + t.revenue, 0);
        const totalOrders = trends.reduce((sum, t) => sum + t.orders, 0);
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        res.json({
            success: true,
            data: {
                period_type: period,
                trends: trends,
                summary: {
                    total_revenue: parseFloat(totalRevenue.toFixed(2)),
                    total_orders: totalOrders,
                    avg_order_value: parseFloat(avgOrderValue.toFixed(2)),
                    periods_count: trends.length
                }
            }
        });
    } catch (error) {
        console.error('Get revenue analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate revenue analytics'
        });
    }
};

/**
 * Get customer statistics
 * GET /api/admin/reports/customers
 */
const getCustomerStats = async (req, res) => {
    try {
        if (!req.admin || !req.admin.id) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }

        const { date_from, date_to } = req.query;

        // Build WHERE clause for date filtering
        const dateConditions = [];
        const dateParams = [];
        let paramCount = 1;

        if (date_from) {
            dateConditions.push(`created_at >= $${paramCount}`);
            dateParams.push(date_from);
            paramCount++;
        }

        if (date_to) {
            dateConditions.push(`created_at <= $${paramCount}`);
            dateParams.push(date_to);
            paramCount++;
        }

        const dateWhereClause = dateConditions.length > 0 
            ? `WHERE ${dateConditions.join(' AND ')}` 
            : '';

        // Get total customer count
        const totalResult = await query('SELECT COUNT(*) as total FROM users');
        
        // Get new customers in period
        const newResult = await query(
            `SELECT COUNT(*) as new_customers FROM users ${dateWhereClause}`,
            dateParams
        );

        // Get repeat customers (customers with more than 1 order)
        const repeatConditions = ["o.status NOT IN ('cancelled', 'failed')"];
        const repeatParams = [];
        paramCount = 1;

        if (date_from) {
            repeatConditions.push(`o.created_at >= $${paramCount}`);
            repeatParams.push(date_from);
            paramCount++;
        }

        if (date_to) {
            repeatConditions.push(`o.created_at <= $${paramCount}`);
            repeatParams.push(date_to);
            paramCount++;
        }

        const repeatWhereClause = repeatConditions.join(' AND ');

        const repeatResult = await query(
            `SELECT COUNT(DISTINCT user_id) as repeat_customers
             FROM (
                 SELECT user_id, COUNT(*) as order_count
                 FROM orders
                 WHERE ${repeatWhereClause}
                 GROUP BY user_id
                 HAVING COUNT(*) > 1
             ) subquery`,
            repeatParams
        );

        // Get customer lifetime value statistics
        const clvResult = await query(
            `SELECT 
                COUNT(DISTINCT o.user_id) as customers_with_orders,
                COALESCE(AVG(user_totals.total_spent), 0) as avg_lifetime_value,
                COALESCE(MAX(user_totals.total_spent), 0) as max_lifetime_value
             FROM orders o
             JOIN (
                 SELECT user_id, SUM(total_amount) as total_spent
                 FROM orders
                 WHERE status NOT IN ('cancelled', 'failed')
                 GROUP BY user_id
             ) user_totals ON o.user_id = user_totals.user_id
             WHERE o.status NOT IN ('cancelled', 'failed')`
        );

        // Get top customers
        const topCustomersResult = await query(
            `SELECT 
                u.id,
                u.email,
                u.name,
                COUNT(o.id) as total_orders,
                COALESCE(SUM(o.total_amount), 0) as total_spent
             FROM users u
             JOIN orders o ON u.id = o.user_id
             WHERE o.status NOT IN ('cancelled', 'failed')
             GROUP BY u.id, u.email, u.name
             ORDER BY total_spent DESC
             LIMIT 10`
        );

        res.json({
            success: true,
            data: {
                overview: {
                    total_customers: parseInt(totalResult.rows[0].total),
                    new_customers: parseInt(newResult.rows[0].new_customers),
                    repeat_customers: parseInt(repeatResult.rows[0].repeat_customers),
                    customers_with_orders: parseInt(clvResult.rows[0].customers_with_orders)
                },
                lifetime_value: {
                    avg_lifetime_value: parseFloat(clvResult.rows[0].avg_lifetime_value),
                    max_lifetime_value: parseFloat(clvResult.rows[0].max_lifetime_value)
                },
                top_customers: topCustomersResult.rows.map(row => ({
                    id: row.id,
                    email: row.email,
                    name: row.name,
                    total_orders: parseInt(row.total_orders),
                    total_spent: parseFloat(row.total_spent)
                })),
                period: {
                    from: date_from || null,
                    to: date_to || null
                }
            }
        });
    } catch (error) {
        console.error('Get customer stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate customer statistics'
        });
    }
};

module.exports = {
    getSalesReport,
    getProductPerformance,
    getRevenueAnalytics,
    getCustomerStats
};
