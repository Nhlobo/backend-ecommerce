require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const adminRoutes = require('./src/routes/admin');
const productsRoutes = require('./src/routes/products');
const ordersRoutes = require('./src/routes/orders');
const authRoutes = require('./src/routes/auth');
const customersRoutes = require('./src/routes/customers');
const { initializeDatabase } = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

function splitOrigins(value) {
    if (!value) return [];
    return value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

const allowedOrigins = new Set([
    process.env.ADMIN_URL,
    process.env.FRONTEND_URL,
    process.env.ADMIN_URL_PRODUCTION,
    process.env.FRONTEND_URL_PRODUCTION,
    ...splitOrigins(process.env.CORS_ORIGINS),
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'https://admin-ecommerce-gcuh.onrender.com',
    'https://frontend-ecommerce-p6sm.onrender.com',
    'https://admin-ecommerce-1.onrender.com',
    'https://admin-ecommerce-o3id.onrender.com',
    'https://frontend-ecommerce-1.onrender.com',
    'https://frontend-ecommerce.onrender.com'
].filter(Boolean));

// CORS configuration
const corsOptions = {
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
            return callback(null, true);
        }

        return callback(new Error(`CORS: Origin ${origin} is not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', cors(corsOptions), (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Premium Hair Backend API'
    });
});

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/customers', customersRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);

    if (err.message && err.message.startsWith('CORS:')) {
        return res.status(403).json({
            success: false,
            message: err.message
        });
    }

    return res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

initializeDatabase()
    .then(() => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Backend API server running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });

module.exports = app;
