const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../database.sqlite');

let db;

function getDatabase() {
    if (!db) {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err);
            } else {
                console.log('✅ Connected to SQLite database');
            }
        });
    }
    return db;
}

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        const database = getDatabase();
        database.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        const database = getDatabase();
        database.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        const database = getDatabase();
        database.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function initializeDatabase() {
    const database = getDatabase();
    
    return new Promise(async (resolve, reject) => {
        database.serialize(async () => {
            try {
                // Admin users table
                await runQuery(`
                    CREATE TABLE IF NOT EXISTS admins (
                        id TEXT PRIMARY KEY,
                        email TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        full_name TEXT NOT NULL,
                        is_active BOOLEAN DEFAULT 1,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_login DATETIME
                    )
                `);

                // Customers table
                await runQuery(`
                    CREATE TABLE IF NOT EXISTS customers (
                        id TEXT PRIMARY KEY,
                        email TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        full_name TEXT NOT NULL,
                        phone TEXT,
                        is_active BOOLEAN DEFAULT 1,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // Products table
                await runQuery(`
                    CREATE TABLE IF NOT EXISTS products (
                        id TEXT PRIMARY KEY,
                        sku TEXT UNIQUE,
                        name TEXT NOT NULL,
                        description TEXT,
                        category TEXT NOT NULL,
                        price_excl_vat REAL NOT NULL,
                        price_incl_vat REAL NOT NULL,
                        stock_quantity INTEGER DEFAULT 0,
                        low_stock_threshold INTEGER DEFAULT 10,
                        is_active BOOLEAN DEFAULT 1,
                        image_url TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // Orders table
                await runQuery(`
                    CREATE TABLE IF NOT EXISTS orders (
                        id TEXT PRIMARY KEY,
                        order_number TEXT UNIQUE NOT NULL,
                        customer_id TEXT NOT NULL,
                        customer_name TEXT NOT NULL,
                        customer_email TEXT NOT NULL,
                        customer_phone TEXT,
                        total_amount REAL NOT NULL,
                        status TEXT DEFAULT 'pending',
                        payment_status TEXT DEFAULT 'pending',
                        payment_method TEXT,
                        shipping_address TEXT,
                        billing_address TEXT,
                        placed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (customer_id) REFERENCES customers(id)
                    )
                `);

                // Order items table
                await runQuery(`
                    CREATE TABLE IF NOT EXISTS order_items (
                        id TEXT PRIMARY KEY,
                        order_id TEXT NOT NULL,
                        product_id TEXT NOT NULL,
                        product_name TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        price_per_unit REAL NOT NULL,
                        total_price REAL NOT NULL,
                        FOREIGN KEY (order_id) REFERENCES orders(id),
                        FOREIGN KEY (product_id) REFERENCES products(id)
                    )
                `);

                // Payments table
                await runQuery(`
                    CREATE TABLE IF NOT EXISTS payments (
                        id TEXT PRIMARY KEY,
                        order_id TEXT NOT NULL,
                        order_number TEXT NOT NULL,
                        customer_name TEXT NOT NULL,
                        amount REAL NOT NULL,
                        payment_method TEXT NOT NULL,
                        status TEXT DEFAULT 'pending',
                        transaction_id TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (order_id) REFERENCES orders(id)
                    )
                `);

                // Discounts table
                await runQuery(`
                    CREATE TABLE IF NOT EXISTS discounts (
                        id TEXT PRIMARY KEY,
                        code TEXT UNIQUE NOT NULL,
                        description TEXT,
                        discount_type TEXT NOT NULL,
                        discount_value REAL NOT NULL,
                        min_purchase_amount REAL,
                        max_discount_amount REAL,
                        usage_limit INTEGER,
                        times_used INTEGER DEFAULT 0,
                        is_active BOOLEAN DEFAULT 1,
                        valid_from DATETIME,
                        valid_until DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // Returns table
                await runQuery(`
                    CREATE TABLE IF NOT EXISTS returns (
                        id TEXT PRIMARY KEY,
                        order_id TEXT NOT NULL,
                        order_number TEXT NOT NULL,
                        customer_name TEXT NOT NULL,
                        reason TEXT NOT NULL,
                        status TEXT DEFAULT 'pending',
                        refund_amount REAL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        resolved_at DATETIME,
                        FOREIGN KEY (order_id) REFERENCES orders(id)
                    )
                `);

                // Activity logs table
                await runQuery(`
                    CREATE TABLE IF NOT EXISTS activity_logs (
                        id TEXT PRIMARY KEY,
                        admin_id TEXT,
                        action TEXT NOT NULL,
                        details TEXT,
                        ip_address TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (admin_id) REFERENCES admins(id)
                    )
                `);

                // Create default admin if not exists
                const adminExists = await getQuery(
                    'SELECT id FROM admins WHERE email = ?',
                    [process.env.ADMIN_EMAIL || 'admin@premiumhairsa.co.za']
                );

                if (!adminExists) {
                    const hashedPassword = await bcrypt.hash(
                        process.env.ADMIN_PASSWORD || 'Admin@123456',
                        10
                    );
                    await runQuery(
                        `INSERT INTO admins (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`,
                        [
                            uuidv4(),
                            process.env.ADMIN_EMAIL || 'admin@premiumhairsa.co.za',
                            hashedPassword,
                            process.env.ADMIN_NAME || 'Admin User'
                        ]
                    );
                    console.log('✅ Default admin user created');
                }

                // Add sample data for testing
                await addSampleData();

                console.log('✅ Database initialized successfully');
                resolve();
            } catch (error) {
                console.error('Error initializing database:', error);
                reject(error);
            }
        });
    });
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
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 10, 1)`,
            [product.id, product.sku, product.name, product.description, product.category, 
             product.price_excl_vat, product.price_incl_vat, product.stock_quantity]
        );
    }

    // Sample customer
    const customerId = uuidv4();
    const customerPassword = await bcrypt.hash('Customer@123', 10);
    await runQuery(
        `INSERT INTO customers (id, email, password_hash, full_name, phone, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [customerId, 'customer@example.com', customerPassword, 'John Doe', '+27123456789']
    );

    // Sample order
    const orderId = uuidv4();
    const orderNumber = `ORD-${Date.now()}`;
    await runQuery(
        `INSERT INTO orders (id, order_number, customer_id, customer_name, customer_email, customer_phone, total_amount, status, payment_status, payment_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', 'completed', 'credit_card')`,
        [orderId, orderNumber, customerId, 'John Doe', 'customer@example.com', '+27123456789', 999.99]
    );

    // Sample order item
    await runQuery(
        `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price_per_unit, total_price)
         VALUES (?, ?, ?, ?, 1, 999.99, 999.99)`,
        [uuidv4(), orderId, sampleProducts[0].id, sampleProducts[0].name]
    );

    // Sample payment
    await runQuery(
        `INSERT INTO payments (id, order_id, order_number, customer_name, amount, payment_method, status, transaction_id)
         VALUES (?, ?, ?, ?, 999.99, 'credit_card', 'completed', ?)`,
        [uuidv4(), orderId, orderNumber, 'John Doe', `TXN-${Date.now()}`]
    );

    console.log('✅ Sample data added successfully');
}

module.exports = {
    getDatabase,
    runQuery,
    getQuery,
    allQuery,
    initializeDatabase
};
