/**
 * Main Server File
 * Premium Hair Wigs & Extensions Backend API
 * Standalone REST API Server (no frontend serving)
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Import middleware
const { apiLimiter, sanitizeInput, detectSuspiciousActivity } = require('./middleware/security');
const { loginLimiter, checkLoginAttempts } = require('./middleware/rateLimiter');
const { authenticateAdmin } = require('./middleware/auth');
const { validateLogin } = require('./middleware/validator');

// Import controllers
const authController = require('./controllers/authController');

// Import routes
const customerAuthRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const ordersRoutes = require('./routes/orders');
const paymentsRoutes = require('./routes/payments');
const discountsRoutes = require('./routes/discounts');
const returnsRoutes = require('./routes/returns');
const adminRoutes = require('./routes/admin');
const adminRoutesLegacy = require('./routes/adminRoutes');
const publicRoutes = require('./routes/publicRoutes');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// =====================================================
// SECURITY MIDDLEWARE
// =====================================================

// Helmet for security headers
app.use(helmet());

// CORS configuration - Allow multiple origins for standalone deployment
const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.ADMIN_URL,
    'https://nhlobo.github.io',
    'http://localhost:8000',
    'http://localhost:8001',
    'http://localhost:3000',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8001',
    'http://127.0.0.1:3000'
].filter(Boolean);

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (process.env.NODE_ENV !== 'production') {
            // In development, allow all origins
            return callback(null, true);
        }
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            return callback(null, true);
        }
        
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request logging
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
}

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Apply input sanitization
app.use(sanitizeInput);

// Apply suspicious activity detection
app.use(detectSuspiciousActivity);

// =====================================================
// API ROUTES
// =====================================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Customer authentication routes
app.use('/api/auth', customerAuthRoutes);

// Admin authentication routes (legacy)
app.post('/api/admin/login', loginLimiter, checkLoginAttempts, validateLogin, authController.login);
app.post('/api/admin/logout', authenticateAdmin, authController.logout);
app.get('/api/admin/me', authenticateAdmin, authController.getCurrentAdmin);
app.post('/api/admin/change-password', authenticateAdmin, authController.changePassword);

// Product routes
app.use('/api/products', productsRoutes);

// Cart routes
app.use('/api/cart', cartRoutes);

// Order routes
app.use('/api/orders', ordersRoutes);

// Payment routes
app.use('/api/payments', paymentsRoutes);

// Discount routes
app.use('/api/discounts', discountsRoutes);

// Returns routes
app.use('/api/returns', returnsRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Public/Customer routes (legacy - non-authenticated)
app.use('/api', publicRoutes);

// Admin routes (legacy - protected)
app.use('/api/admin', authenticateAdmin, adminRoutesLegacy);

// =====================================================
// ERROR HANDLING
// =====================================================

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// 404 handler for non-API routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    
    res.status(err.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║      Premium Hair Backend API - Standalone Server         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`✓ Backend API server running on port ${PORT}`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('');
    console.log('📍 API Endpoint:');
    console.log(`   ${process.env.NODE_ENV === 'production' ? 'https://your-backend-url.com' : `http://localhost:${PORT}`}/api`);
    console.log('');
    console.log('🔒 Security Features:');
    console.log('   ✓ Helmet (Security Headers)');
    console.log('   ✓ Rate Limiting');
    console.log('   ✓ JWT Authentication');
    console.log('   ✓ Brute-force Protection');
    console.log('   ✓ CORS for Frontend/Admin');
    console.log('');
    console.log('Press Ctrl+C to stop the server');
    console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n⚠️  SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n⚠️  SIGINT received. Shutting down gracefully...');
    process.exit(0);
});

module.exports = app;
