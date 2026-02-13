/**
 * Database Connection Configuration
 * PostgreSQL Connection Pool
 */

const { Pool } = require('pg');
require('dotenv').config();

// Create connection pool
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'premium_hair_ecommerce',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
    console.log('✓ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
    process.exit(-1);
});

/**
 * Execute a query
 * @param {string} text - SQL query
 * @param {array} params - Query parameters
 */
const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};

/**
 * Get a client from the pool for transactions
 */
const getClient = async () => {
    const client = await pool.connect();
    const query = client.query.bind(client);
    const release = client.release.bind(client);
    
    // Set a timeout of 5 seconds
    const timeout = setTimeout(() => {
        console.error('A client has been checked out for more than 5 seconds!');
    }, 5000);
    
    // Monkey patch the release method to clear timeout
    client.release = () => {
        clearTimeout(timeout);
        return release();
    };
    
    return client;
};

/**
 * Execute a transaction
 * @param {function} callback - Callback function with client parameter
 */
const transaction = async (callback) => {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    query,
    getClient,
    transaction,
    pool
};
