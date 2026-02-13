/**
 * Database Initialization Script
 * Run this to set up the database schema and create initial admin user
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, query } = require('./connection');
require('dotenv').config();

async function initializeDatabase() {
    console.log('🚀 Initializing Premium Hair E-commerce Database...\n');
    
    try {
        // Read and execute schema
        console.log('📋 Creating database schema...');
        const schemaSQL = fs.readFileSync(
            path.join(__dirname, 'schema.sql'),
            'utf8'
        );
        
        await pool.query(schemaSQL);
        console.log('✓ Database schema created successfully\n');
        
        // Create initial admin user
        console.log('👤 Creating initial admin user...');
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@premiumhairsa.co.za';
        const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeThisPassword123!';
        
        // Check if admin already exists
        const existingAdmin = await query(
            'SELECT id FROM admin_users WHERE email = $1',
            [adminEmail]
        );
        
        if (existingAdmin.rows.length > 0) {
            console.log('⚠️  Admin user already exists');
        } else {
            const passwordHash = await bcrypt.hash(adminPassword, 12);
            
            await query(
                `INSERT INTO admin_users (email, password_hash, full_name, role) 
                 VALUES ($1, $2, $3, $4)`,
                [adminEmail, passwordHash, 'System Administrator', 'super_admin']
            );
            
            console.log('✓ Admin user created successfully');
            console.log(`   Email: ${adminEmail}`);
            console.log(`   Password: ${adminPassword}`);
            console.log('   ⚠️  IMPORTANT: Change this password after first login!\n');
        }
        
        // Insert sample data
        console.log('📦 Inserting sample data...');
        await insertSampleData();
        console.log('✓ Sample data inserted successfully\n');
        
        console.log('🎉 Database initialization completed successfully!');
        console.log('\n📝 Next steps:');
        console.log('1. Start the server: npm start');
        console.log('2. Access admin dashboard: http://localhost:3000/admin');
        console.log('3. Login with the credentials above');
        console.log('4. Change your password immediately\n');
        
    } catch (error) {
        console.error('❌ Error initializing database:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

async function insertSampleData() {
    // Insert sample products
    const products = [
        {
            name: 'Premium Lace Front Wig - Natural Black',
            description: '100% Human Hair Lace Front Wig, 18 inches, Natural Black',
            category: 'wigs',
            base_price: 1500.00,
            price_incl_vat: 1725.00,
            stock_quantity: 15,
            sku: 'WIG-LF-18-NBK',
            is_featured: true,
            image_url: 'assets/images/products/wig1.jpg'
        },
        {
            name: 'Clip-In Hair Extensions - Honey Brown',
            description: 'Premium Clip-In Extensions, 20 inches, Honey Brown',
            category: 'extensions',
            base_price: 850.00,
            price_incl_vat: 977.50,
            stock_quantity: 25,
            sku: 'EXT-CI-20-HNY',
            is_featured: true,
            image_url: 'assets/images/products/ext1.jpg'
        },
        {
            name: 'Silk Bonnet - Premium Quality',
            description: 'Protect your hair while sleeping, Premium silk bonnet',
            category: 'accessories',
            base_price: 180.00,
            price_incl_vat: 207.00,
            stock_quantity: 50,
            sku: 'ACC-BON-SILK',
            is_active: true,
            image_url: 'assets/images/products/acc1.jpg'
        }
    ];
    
    for (const product of products) {
        await query(
            `INSERT INTO products 
             (name, description, category, base_price, price_incl_vat, stock_quantity, sku, is_featured, is_active, image_url) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (sku) DO NOTHING`,
            [
                product.name,
                product.description,
                product.category,
                product.base_price,
                product.price_incl_vat,
                product.stock_quantity,
                product.sku,
                product.is_featured || false,
                product.is_active !== false,
                product.image_url
            ]
        );
    }
    
    // Insert sample policy documents
    const policies = [
        {
            policy_type: 'privacy',
            title: 'Privacy Policy',
            content: 'This is a sample privacy policy. Replace with actual content.',
            version: '1.0',
            effective_date: new Date().toISOString().split('T')[0]
        },
        {
            policy_type: 'terms',
            title: 'Terms and Conditions',
            content: 'This is a sample terms and conditions. Replace with actual content.',
            version: '1.0',
            effective_date: new Date().toISOString().split('T')[0]
        },
        {
            policy_type: 'returns',
            title: 'Returns Policy',
            content: 'This is a sample returns policy. Replace with actual content.',
            version: '1.0',
            effective_date: new Date().toISOString().split('T')[0]
        }
    ];
    
    for (const policy of policies) {
        await query(
            `INSERT INTO policy_documents 
             (policy_type, title, content, version, is_active, effective_date) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                policy.policy_type,
                policy.title,
                policy.content,
                policy.version,
                true,
                policy.effective_date
            ]
        );
    }
}

// Run initialization if called directly
if (require.main === module) {
    initializeDatabase();
}

module.exports = { initializeDatabase };
