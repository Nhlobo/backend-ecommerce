/**
 * Activity Logging Middleware
 * Logs all admin actions for audit trail
 */

const { query } = require('../db/connection');

/**
 * Log admin activity
 */
const logActivity = (action, entityType = null, severity = 'info') => {
    return async (req, res, next) => {
        // Execute the next middleware/handler first
        const originalJson = res.json.bind(res);
        
        res.json = function(data) {
            // Only log if admin is authenticated
            if (req.admin) {
                const entityId = req.params.id || null;
                const details = JSON.stringify({
                    method: req.method,
                    path: req.path,
                    body: req.method !== 'GET' ? req.body : undefined,
                    response: data
                });
                
                // Log asynchronously without blocking response
                query(
                    `INSERT INTO activity_logs 
                     (admin_id, action, entity_type, entity_id, details, ip_address, user_agent, severity)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        req.admin.id,
                        action,
                        entityType,
                        entityId,
                        details,
                        req.ip,
                        req.get('user-agent'),
                        severity
                    ]
                ).catch(error => {
                    console.error('Error logging activity:', error);
                });
            }
            
            return originalJson(data);
        };
        
        next();
    };
};

/**
 * Log data access for POPIA compliance
 */
const logDataAccess = (dataType, accessType = 'view') => {
    return async (req, res, next) => {
        if (req.admin) {
            const customerId = req.params.customerId || req.body.customerId || null;
            
            query(
                `INSERT INTO data_access_logs 
                 (admin_id, customer_id, access_type, data_type, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    req.admin.id,
                    customerId,
                    accessType,
                    dataType,
                    req.ip
                ]
            ).catch(error => {
                console.error('Error logging data access:', error);
            });
        }
        
        next();
    };
};

module.exports = {
    logActivity,
    logDataAccess
};
