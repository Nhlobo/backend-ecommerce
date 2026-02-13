-- Premium Hair Wigs & Extensions E-commerce Database Schema
-- PostgreSQL Database for Admin Dashboard

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- ADMIN & AUTHENTICATION TABLES
-- =====================================================

-- Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Sessions Table (for session management)
CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Login Attempts Table (for brute-force protection)
CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(50) NOT NULL,
    success BOOLEAN DEFAULT false,
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CUSTOMER TABLES
-- =====================================================

-- Customers Table
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer Addresses Table
CREATE TABLE IF NOT EXISTS customer_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    postal_code VARCHAR(10) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PRODUCT TABLES
-- =====================================================

-- Products Table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    base_price DECIMAL(10, 2) NOT NULL,
    price_incl_vat DECIMAL(10, 2) NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    sku VARCHAR(100) UNIQUE,
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    on_sale BOOLEAN DEFAULT false,
    sale_price DECIMAL(10, 2),
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product Variants Table (for different colors, lengths, etc.)
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_name VARCHAR(100) NOT NULL,
    variant_value VARCHAR(100) NOT NULL,
    price_adjustment DECIMAL(10, 2) DEFAULT 0,
    stock_quantity INTEGER DEFAULT 0,
    sku VARCHAR(100) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wishlist Table
CREATE TABLE IF NOT EXISTS wishlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, product_id)
);

-- =====================================================
-- ORDER TABLES
-- =====================================================

-- Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id),
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20),
    
    -- Pricing
    subtotal DECIMAL(10, 2) NOT NULL,
    vat_amount DECIMAL(10, 2) NOT NULL,
    shipping_cost DECIMAL(10, 2) DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL,
    
    -- Shipping Address
    shipping_address_line1 VARCHAR(255) NOT NULL,
    shipping_address_line2 VARCHAR(255),
    shipping_city VARCHAR(100) NOT NULL,
    shipping_province VARCHAR(100) NOT NULL,
    shipping_postal_code VARCHAR(10) NOT NULL,
    
    -- Order Status
    status VARCHAR(50) DEFAULT 'pending',
    payment_status VARCHAR(50) DEFAULT 'pending',
    fulfillment_status VARCHAR(50) DEFAULT 'unfulfilled',
    
    -- Tracking
    tracking_number VARCHAR(100),
    carrier VARCHAR(100),
    
    -- Timestamps
    placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    
    -- Notes
    customer_notes TEXT,
    admin_notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100),
    variant_details TEXT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PAYMENT TABLES
-- =====================================================

-- Payments Table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    payment_method VARCHAR(50) NOT NULL,
    payment_gateway VARCHAR(50),
    
    -- PayFast specific fields
    payfast_payment_id VARCHAR(100),
    payfast_transaction_id VARCHAR(100),
    
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Payment details
    card_last_four VARCHAR(4),
    card_type VARCHAR(50),
    
    -- Timestamps
    authorized_at TIMESTAMP,
    captured_at TIMESTAMP,
    failed_at TIMESTAMP,
    refunded_at TIMESTAMP,
    
    -- Additional info
    failure_reason TEXT,
    gateway_response TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- DISCOUNT & PROMOTION TABLES
-- =====================================================

-- Discount Codes Table
CREATE TABLE IF NOT EXISTS discount_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL, -- 'percentage' or 'fixed'
    discount_value DECIMAL(10, 2) NOT NULL,
    min_order_value DECIMAL(10, 2) DEFAULT 0,
    max_discount_amount DECIMAL(10, 2),
    usage_limit INTEGER,
    times_used INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    starts_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Discount Usage Table
CREATE TABLE IF NOT EXISTS discount_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discount_code_id UUID REFERENCES discount_codes(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id),
    discount_amount DECIMAL(10, 2) NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- RETURNS & REFUNDS TABLES
-- =====================================================

-- Returns Table
CREATE TABLE IF NOT EXISTS returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_number VARCHAR(50) UNIQUE NOT NULL,
    order_id UUID REFERENCES orders(id),
    customer_id UUID REFERENCES customers(id),
    
    -- Return Details
    reason VARCHAR(255) NOT NULL,
    detailed_reason TEXT,
    return_method VARCHAR(50), -- 'courier', 'drop-off'
    
    -- Status
    status VARCHAR(50) DEFAULT 'requested',
    
    -- Inspection
    inspection_notes TEXT,
    inspection_result VARCHAR(50), -- 'approved', 'rejected', 'partial'
    
    -- Refund
    refund_amount DECIMAL(10, 2),
    refund_method VARCHAR(50),
    
    -- Timestamps
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    rejected_at TIMESTAMP,
    received_at TIMESTAMP,
    refunded_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Return Items Table
CREATE TABLE IF NOT EXISTS return_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_id UUID REFERENCES returns(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id),
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT,
    condition VARCHAR(50), -- 'unopened', 'used', 'damaged'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refunds Table
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    payment_id UUID REFERENCES payments(id),
    return_id UUID REFERENCES returns(id),
    
    amount DECIMAL(10, 2) NOT NULL,
    refund_method VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Gateway info
    gateway_refund_id VARCHAR(100),
    gateway_response TEXT,
    
    reason TEXT,
    admin_notes TEXT,
    
    processed_at TIMESTAMP,
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- COMPLIANCE & LEGAL TABLES
-- =====================================================

-- VAT Records Table
CREATE TABLE IF NOT EXISTS vat_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    
    -- VAT Details
    vat_rate DECIMAL(5, 4) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    vat_amount DECIMAL(10, 2) NOT NULL,
    total_incl_vat DECIMAL(10, 2) NOT NULL,
    
    -- Invoice Details
    invoice_number VARCHAR(50) UNIQUE,
    invoice_date DATE NOT NULL,
    
    -- Period
    tax_period_start DATE NOT NULL,
    tax_period_end DATE NOT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Data Access Logs (POPIA Compliance)
CREATE TABLE IF NOT EXISTS data_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES admin_users(id),
    customer_id UUID REFERENCES customers(id),
    access_type VARCHAR(50) NOT NULL, -- 'view', 'export', 'modify', 'delete'
    data_type VARCHAR(50) NOT NULL, -- 'customer_profile', 'order_data', etc.
    ip_address VARCHAR(50),
    reason TEXT,
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Policy Documents Table
CREATE TABLE IF NOT EXISTS policy_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_type VARCHAR(50) NOT NULL, -- 'terms', 'privacy', 'returns'
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    version VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    effective_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- SECURITY & AUDIT TABLES
-- =====================================================

-- Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES admin_users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50), -- 'order', 'product', 'customer', etc.
    entity_id UUID,
    details TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    severity VARCHAR(20) DEFAULT 'info', -- 'info', 'warning', 'critical'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Security Events Table
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL, -- 'failed_login', 'suspicious_activity', etc.
    severity VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
    description TEXT NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    related_admin_id UUID REFERENCES admin_users(id),
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ANALYTICS & REPORTS TABLES
-- =====================================================

-- Sales Summary (Pre-aggregated for performance)
CREATE TABLE IF NOT EXISTS sales_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    summary_date DATE NOT NULL UNIQUE,
    total_orders INTEGER DEFAULT 0,
    total_revenue DECIMAL(12, 2) DEFAULT 0,
    total_vat DECIMAL(12, 2) DEFAULT 0,
    total_refunds DECIMAL(12, 2) DEFAULT 0,
    average_order_value DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product Performance Tracking
CREATE TABLE IF NOT EXISTS product_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    units_sold INTEGER DEFAULT 0,
    revenue DECIMAL(12, 2) DEFAULT 0,
    returns_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CONTACT & NEWSLETTER TABLES
-- =====================================================

-- Contact form submissions
CREATE TABLE IF NOT EXISTS contact_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    subject VARCHAR(500),
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, responded, resolved
    responded_by UUID REFERENCES admin_users(id),
    responded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Newsletter subscribers
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    unsubscribed_at TIMESTAMP
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Admin and Auth Indexes
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);

-- Customer Indexes
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id);

-- Product Indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_customer_id ON wishlist(customer_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_product_id ON wishlist(product_id);

-- Order Indexes
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_placed_at ON orders(placed_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- Payment Indexes
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Discount Indexes
CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);
CREATE INDEX IF NOT EXISTS idx_discount_usage_discount_code_id ON discount_usage(discount_code_id);

-- Returns & Refunds Indexes
CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON refunds(order_id);

-- Compliance Indexes
CREATE INDEX IF NOT EXISTS idx_vat_records_order_id ON vat_records(order_id);
CREATE INDEX IF NOT EXISTS idx_vat_records_invoice_number ON vat_records(invoice_number);
CREATE INDEX IF NOT EXISTS idx_data_access_logs_admin_id ON data_access_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_data_access_logs_customer_id ON data_access_logs(customer_id);

-- Security Indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_admin_id ON activity_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_resolved ON security_events(resolved);

-- Analytics Indexes
CREATE INDEX IF NOT EXISTS idx_sales_summary_date ON sales_summary(summary_date);
CREATE INDEX IF NOT EXISTS idx_product_performance_product_id ON product_performance(product_id);

-- Contact & Newsletter Indexes
CREATE INDEX IF NOT EXISTS idx_contact_submissions_email ON contact_submissions(email);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON contact_submissions(status);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at ON contact_submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_is_active ON newsletter_subscribers(is_active);
