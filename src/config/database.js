const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Create PostgreSQL connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection on startup
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
});

async function runQuery(sql, params = []) {
    const client = await pool.connect();
    try {
        const result = await client.query(sql, params);
        return {
            lastID: result.rows.length > 0 ? result.rows[0]?.id : undefined,
            changes: result.rowCount,
            rows: result.rows
        };
    } finally {
        client.release();
    }
}

async function getQuery(sql, params = []) {
    const client = await pool.connect();
    try {
        const result = await client.query(sql, params);
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function allQuery(sql, params = []) {
    const client = await pool.connect();
    try {
        const result = await client.query(sql, params);
        return result.rows;
    } finally {
        client.release();
    }
}

async function initializeDatabase() {
    try {
        // Admin users table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS admins (
                id VARCHAR(255) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        `);

        // Customers table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS customers (
                id VARCHAR(255) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Products table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS products (
                id VARCHAR(255) PRIMARY KEY,
                sku VARCHAR(100) UNIQUE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                category VARCHAR(100) NOT NULL,
                price_excl_vat DECIMAL(10, 2) NOT NULL,
                price_incl_vat DECIMAL(10, 2) NOT NULL,
                stock_quantity INTEGER DEFAULT 0,
                low_stock_threshold INTEGER DEFAULT 10,
                is_active BOOLEAN DEFAULT TRUE,
                image_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Orders table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS orders (
                id VARCHAR(255) PRIMARY KEY,
                order_number VARCHAR(100) UNIQUE NOT NULL,
                customer_id VARCHAR(255) NOT NULL,
                customer_name VARCHAR(255) NOT NULL,
                customer_email VARCHAR(255) NOT NULL,
                customer_phone VARCHAR(50),
                total_amount DECIMAL(10, 2) NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                payment_status VARCHAR(50) DEFAULT 'pending',
                payment_method VARCHAR(50),
                shipping_address TEXT,
                billing_address TEXT,
                placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (customer_id) REFERENCES customers(id)
            )
        `);

        // Order items table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS order_items (
                id VARCHAR(255) PRIMARY KEY,
                order_id VARCHAR(255) NOT NULL,
                product_id VARCHAR(255) NOT NULL,
                product_name VARCHAR(255) NOT NULL,
                quantity INTEGER NOT NULL,
                price_per_unit DECIMAL(10, 2) NOT NULL,
                total_price DECIMAL(10, 2) NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            )
        `);

        // Payments table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS payments (
                id VARCHAR(255) PRIMARY KEY,
                order_id VARCHAR(255) NOT NULL,
                order_number VARCHAR(100) NOT NULL,
                customer_name VARCHAR(255) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                payment_method VARCHAR(50) NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                transaction_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )
        `);

        // Discounts table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS discounts (
                id VARCHAR(255) PRIMARY KEY,
                code VARCHAR(100) UNIQUE NOT NULL,
                description TEXT,
                discount_type VARCHAR(50) NOT NULL,
                discount_value DECIMAL(10, 2) NOT NULL,
                min_purchase_amount DECIMAL(10, 2),
                max_discount_amount DECIMAL(10, 2),
                usage_limit INTEGER,
                times_used INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                valid_from TIMESTAMP,
                valid_until TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Returns table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS returns (
                id VARCHAR(255) PRIMARY KEY,
                order_id VARCHAR(255) NOT NULL,
                order_number VARCHAR(100) NOT NULL,
                customer_name VARCHAR(255) NOT NULL,
                reason TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                refund_amount DECIMAL(10, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )
        `);

        // Activity logs table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id VARCHAR(255) PRIMARY KEY,
                admin_id VARCHAR(255),
                action VARCHAR(255) NOT NULL,
                details TEXT,
                ip_address VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_id) REFERENCES admins(id)
            )
        `);

        // Create default admin if not exists
        const adminExists = await getQuery(
            'SELECT id FROM admins WHERE email = $1',
            [process.env.ADMIN_EMAIL || 'admin@premiumhair.com']
        );

        if (!adminExists) {
            const hashedPassword = await bcrypt.hash(
                process.env.ADMIN_PASSWORD || 'admin123',
                10
            );
            await runQuery(
                `INSERT INTO admins (id, email, password_hash, full_name) VALUES ($1, $2, $3, $4)`,
                [
                    uuidv4(),
                    process.env.ADMIN_EMAIL || 'admin@premiumhair.com',
                    hashedPassword,
                    process.env.ADMIN_NAME || 'Admin User'
                ]
            );
            console.log('✅ Default admin user created');
        }

        // Add sample data for testing
        await addSampleData();

        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
}

async function addSampleData() {
    // Check if we already have sample data
    const productCount = await getQuery('SELECT COUNT(*) as count FROM products');
    if (productCount.count > 0) {
        return; // Sample data already exists
    }

    // Sample products
    const sampleProducts = [
        {
            id: uuidv4(),
            sku: 'WIG001',
            name: 'Premium Lace Front Wig - Natural Black',
            description: 'High-quality human hair lace front wig',
            category: 'Wigs',
            price_excl_vat: 869.57,
            price_incl_vat: 999.99,
            stock_quantity: 25
        },
        {
            id: uuidv4(),
            sku: 'EXT001',
            name: 'Clip-In Hair Extensions - 18 inch',
            description: 'Premium clip-in hair extensions',
            category: 'Extensions',
            price_excl_vat: 434.78,
            price_incl_vat: 499.99,
            stock_quantity: 50
        },
        {
            id: uuidv4(),
            sku: 'WIG002',
            name: 'Curly Synthetic Wig - Brown',
            description: 'Beautiful curly synthetic wig',
            category: 'Wigs',
            price_excl_vat: 347.83,
            price_incl_vat: 399.99,
            stock_quantity: 15
        }
    ];

    for (const product of sampleProducts) {
        await runQuery(
            `INSERT INTO products (id, sku, name, description, category, price_excl_vat, price_incl_vat, stock_quantity, low_stock_threshold, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 10, TRUE)`,
            [product.id, product.sku, product.name, product.description, product.category, 
             product.price_excl_vat, product.price_incl_vat, product.stock_quantity]
        );
    }

    // Sample customer
    const customerId = uuidv4();
    const customerPassword = await bcrypt.hash('Customer@123', 10);
    await runQuery(
        `INSERT INTO customers (id, email, password_hash, full_name, phone, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        [customerId, 'customer@example.com', customerPassword, 'John Doe', '+27123456789']
    );

    // Sample order
    const orderId = uuidv4();
    const orderNumber = `ORD-${Date.now()}`;
    await runQuery(
        `INSERT INTO orders (id, order_number, customer_id, customer_name, customer_email, customer_phone, total_amount, status, payment_status, payment_method)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', 'completed', 'credit_card')`,
        [orderId, orderNumber, customerId, 'John Doe', 'customer@example.com', '+27123456789', 999.99]
    );

    // Sample order item
    await runQuery(
        `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price_per_unit, total_price)
         VALUES ($1, $2, $3, $4, 1, 999.99, 999.99)`,
        [uuidv4(), orderId, sampleProducts[0].id, sampleProducts[0].name]
    );

    // Sample payment
    await runQuery(
        `INSERT INTO payments (id, order_id, order_number, customer_name, amount, payment_method, status, transaction_id)
         VALUES ($1, $2, $3, $4, 999.99, 'credit_card', 'completed', $5)`,
        [uuidv4(), orderId, orderNumber, 'John Doe', `TXN-${Date.now()}`]
    );

    console.log('✅ Sample data added successfully');
}

module.exports = {
    pool,
    runQuery,
    getQuery,
    allQuery,
    initializeDatabase
};
