# Premium Hair Wigs & Extensions - Backend API

This is the backend API server for the Premium Hair e-commerce platform. It provides RESTful API endpoints that are consumed by:
- **Admin Dashboard**: [Nhlobo/admin-ecommerce](https://github.com/Nhlobo/admin-ecommerce)
- **Customer Frontend**: [Nhlobo/frontend-ecommerce](https://github.com/Nhlobo/frontend-ecommerce)

This repository contains **ONLY** backend API code - no UI or frontend assets.

## 🚀 Features

- **Authentication & Authorization**
  - JWT-based authentication
  - Secure password hashing with bcrypt
  - Token-based session management
  
- **Admin APIs**
  - Dashboard overview with metrics
  - Orders management
  - Payments tracking
  - Customer management
  - Products and inventory
  - Discounts and promotions
  - Returns and refunds
  - Compliance and activity logs
  
- **Public APIs**
  - Product listing
  - Product details
  - Order creation
  
- **Security Features**
  - Helmet for HTTP security headers
  - CORS configuration
  - Rate limiting
  - SQL injection protection

## 📋 Prerequisites

- Node.js >= 14.0.0
- npm or yarn

## 🔧 Installation

1. **Clone or copy this backend directory**

2. **Install dependencies:**
```bash
npm install
```

3. **Configure environment variables:**
```bash
cp .env.example .env
```

Edit `.env` file with your configuration:
```env
NODE_ENV=development
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h
ADMIN_EMAIL=admin@premiumhairsa.co.za
ADMIN_PASSWORD=Admin@123456
ADMIN_NAME=Admin User
DATABASE_URL=postgresql://username:password@localhost:5432/premium_hair
FRONTEND_URL=http://localhost:3001
ADMIN_URL=http://localhost:3000
```

4. **Initialize the database:**
```bash
npm run init-db
```
or simply start the server (it will auto-initialize):
```bash
npm start
```

## 🎮 Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

The server will start on port 3000 (or the PORT specified in `.env`).

## 📡 API Endpoints

### Response Format

All API responses follow this standardized format:

```json
{
  "success": true/false,
  "message": "Descriptive message",
  "data": { ... } or [...],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### Public Endpoints

#### Health Check
```
GET /health                          # Server health status
```

**Response Example:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "Premium Hair Backend API"
}
```

#### Products
```
GET /api/products                    # Get all products (with filters)
GET /api/products/:id                # Get product by ID
GET /api/products/categories/list    # Get all categories
GET /api/products/featured           # Get featured products
GET /api/products/search             # Advanced product search
```

**Query Parameters:**
- `GET /api/products`: `category`, `search`, `limit` (max 100)
- `GET /api/products/featured`: `limit` (max 50)
- `GET /api/products/search`: `q`, `category`, `min_price`, `max_price`, `in_stock`, `page`, `limit`

**Example Request:**
```bash
GET /api/products/search?q=wig&category=Wigs&min_price=100&max_price=500&page=1&limit=20
```

#### Orders
```
POST /api/orders                     # Create new order
GET /api/orders/:id                  # Get order by ID
```

**Create Order Request Body:**
```json
{
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "customer_phone": "+27123456789",
  "items": [
    {
      "product_id": "uuid",
      "quantity": 2
    }
  ],
  "shipping_address": {
    "street": "123 Main St",
    "city": "Johannesburg",
    "province": "Gauteng",
    "postal_code": "2000"
  },
  "billing_address": { ... },
  "payment_method": "credit_card"
}
```

#### Customers (Public Authentication)
```
POST /api/customers/register         # Customer registration
POST /api/customers/login            # Customer login
GET /api/customers/profile           # Get profile (authenticated)
PUT /api/customers/profile           # Update profile (authenticated)
GET /api/customers/orders            # Get order history (authenticated)
```

**Registration Request:**
```json
{
  "email": "customer@example.com",
  "password": "SecurePass123",
  "full_name": "Jane Doe",
  "phone": "+27123456789"
}
```

**Login Request:**
```json
{
  "email": "customer@example.com",
  "password": "SecurePass123"
}
```

### Admin Endpoints (Require Authentication)

All admin endpoints require an `Authorization` header with a valid JWT token:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

#### Authentication
```
POST /api/admin/login                # Admin login
POST /api/admin/logout               # Admin logout
GET /api/admin/verify                # Verify token
GET /api/admin/health                # API health check

# Compatibility aliases for admin UIs expecting /api/auth/*
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/verify
```

**Login Request:**
```json
{
  "email": "admin@premiumhairsa.co.za",
  "password": "Admin@123456"
}
```

**Login Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "admin": {
      "id": "uuid",
      "email": "admin@premiumhairsa.co.za",
      "fullName": "Admin User"
    }
  }
}
```

#### Dashboard & Analytics
```
GET /api/admin/dashboard/overview    # Dashboard summary metrics
GET /api/admin/dashboard/stats       # Detailed analytics (with date filters)
```

**Query Parameters for Stats:**
- `start_date`: ISO date string (e.g., "2024-01-01")
- `end_date`: ISO date string (e.g., "2024-01-31")

#### Product Management
```
GET /api/admin/products              # List all products (with pagination)
POST /api/admin/products             # Create new product
PUT /api/admin/products/:id          # Update product
DELETE /api/admin/products/:id       # Delete product (soft delete)
PATCH /api/admin/products/:id/stock  # Update stock quantity
```

**Create/Update Product Request:**
```json
{
  "sku": "WIG001",
  "name": "Premium Lace Front Wig",
  "description": "High-quality human hair",
  "category": "Wigs",
  "price_excl_vat": 869.57,
  "price_incl_vat": 999.99,
  "stock_quantity": 25,
  "low_stock_threshold": 10,
  "image_url": "https://example.com/image.jpg"
}
```

**Update Stock Request:**
```json
{
  "stock_quantity": 50
}
```

#### Order Management
```
GET /api/admin/orders                       # List all orders (with filters)
GET /api/admin/orders/:id                   # Get order details
PATCH /api/admin/orders/:id/status          # Update order status
PATCH /api/admin/orders/:id/payment-status  # Update payment status
```

**Query Parameters:**
- `status`: pending, processing, shipped, delivered, cancelled
- `search`: Search by order number, customer name, or email
- `page`, `limit`: Pagination

**Update Order Status:**
```json
{
  "status": "processing"
}
```

**Update Payment Status:**
```json
{
  "payment_status": "completed"
}
```

#### Customer Management
```
GET /api/admin/customers                 # List all customers (with pagination)
GET /api/admin/customers/:id             # Get customer details
PATCH /api/admin/customers/:id/status    # Activate/deactivate customer
GET /api/admin/customers/:id/orders      # Get customer order history
```

**Toggle Customer Status:**
```json
{
  "is_active": false
}
```

#### Payment Management
```
GET /api/admin/payments              # List all payments (with filters)
GET /api/admin/payments/:id          # Get payment details
PATCH /api/admin/payments/:id/status # Update payment status
```

**Update Payment Status:**
```json
{
  "status": "completed"
}
```

#### Discount Management
```
GET /api/admin/discounts             # List all discounts
POST /api/admin/discounts            # Create discount code
PUT /api/admin/discounts/:id         # Update discount
DELETE /api/admin/discounts/:id      # Delete discount
PATCH /api/admin/discounts/:id/status # Toggle active status
```

**Create/Update Discount:**
```json
{
  "code": "SUMMER2024",
  "description": "Summer sale discount",
  "discount_type": "percentage",
  "discount_value": 15.00,
  "min_purchase_amount": 500.00,
  "max_discount_amount": 200.00,
  "usage_limit": 100,
  "valid_from": "2024-06-01T00:00:00Z",
  "valid_until": "2024-08-31T23:59:59Z"
}
```

#### Returns Management
```
GET /api/admin/returns               # List all returns
GET /api/admin/returns/:id           # Get return details
PATCH /api/admin/returns/:id/status  # Update return status
POST /api/admin/returns/:id/refund   # Process refund
```

**Update Return Status:**
```json
{
  "status": "approved"
}
```

**Process Refund:**
```json
{
  "refund_amount": 999.99
}
```

#### Admin User Management
```
GET /api/admin/users                 # List all admin users
POST /api/admin/users                # Create new admin user
PUT /api/admin/users/:id             # Update admin user
PATCH /api/admin/users/:id/status    # Activate/deactivate admin
```

**Create/Update Admin User:**
```json
{
  "email": "newadmin@premiumhairsa.co.za",
  "password": "SecurePassword123",
  "full_name": "New Admin"
}
```

#### Compliance & Reporting
```
GET /api/admin/compliance/vat              # VAT records and reports
GET /api/admin/compliance/activity-logs    # System activity logs
GET /api/admin/compliance/policies         # Compliance policies
GET /api/admin/reports/sales               # Sales reports (with date filters)
GET /api/admin/reports/inventory           # Inventory reports
```

**Query Parameters for Reports:**
- `start_date`, `end_date`: Date range filters

#### Security
```
GET /api/admin/security/events       # Security events log
```

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. To access protected endpoints:

1. **Login** via `/api/admin/login` or `/api/customers/login` with email and password
2. **Receive a JWT token** in the response
3. **Include the token** in subsequent requests:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

### Token Expiration

Tokens expire after 24 hours (configurable via `JWT_EXPIRES_IN` environment variable).

### Role-Based Access Control

- **Admin routes** (`/api/admin/*`) require a token with `role: "admin"`
- **Customer routes** (`/api/customers/*`) require a token with `role: "customer"`
- **Public routes** do not require authentication

### Default Admin Credentials
- **Email:** admin@premiumhairsa.co.za
- **Password:** Admin@123456

**⚠️ IMPORTANT:** Change these credentials in production by setting the `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables before first run!

### Password Requirements

For security, all passwords must meet these requirements:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

### Example Authentication Flow

```bash
# 1. Login
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@premiumhairsa.co.za","password":"Admin@123456"}'

# Response:
# {
#   "success": true,
#   "message": "Login successful",
#   "data": {
#     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#     "admin": { "id": "...", "email": "...", "fullName": "..." }
#   }
# }

# 2. Use token for protected endpoints
curl http://localhost:3000/api/admin/products \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## 🌍 Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
NODE_ENV=development                    # development or production
PORT=3000                               # Server port

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key    # CHANGE THIS IN PRODUCTION!
JWT_EXPIRES_IN=24h                      # Token expiration time

# Admin Credentials (Initial Setup)
ADMIN_EMAIL=admin@premiumhairsa.co.za
ADMIN_PASSWORD=Admin@123456             # CHANGE THIS IN PRODUCTION!
ADMIN_NAME=Admin User

# Database Configuration
DATABASE_URL=postgresql://user:password@host:port/database

# Frontend URLs (for CORS)
FRONTEND_URL=http://localhost:3001
ADMIN_URL=http://localhost:3000
CORS_ORIGINS=https://admin.example.com,https://frontend.example.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000             # 15 minutes in milliseconds
RATE_LIMIT_MAX_REQUESTS=100             # Max requests per window

# Pagination
PAGINATION_MAX_LIMIT=100                # Maximum items per page
PAGINATION_DEFAULT_LIMIT=20             # Default items per page
```

### Required Variables

- **DATABASE_URL**: PostgreSQL connection string (REQUIRED)
- **JWT_SECRET**: Secret key for signing JWT tokens (REQUIRED for production)

### Optional Variables

- **PORT**: Server port (default: 3000)
- **JWT_EXPIRES_IN**: Token expiration (default: 24h)
- **ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME**: Initial admin credentials
- **FRONTEND_URL, ADMIN_URL, CORS_ORIGINS**: CORS configuration
- **RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS**: Rate limiting settings
- **PAGINATION_MAX_LIMIT, PAGINATION_DEFAULT_LIMIT**: Pagination configuration

## 🗄️ Database

The application uses PostgreSQL for production-grade data persistence.

### Database Configuration

Set the `DATABASE_URL` environment variable with your PostgreSQL connection string:
```
DATABASE_URL=postgresql://username:password@host:port/database
```

For local development with PostgreSQL:
```bash
# Install PostgreSQL (if not already installed)
# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# macOS
brew install postgresql

# Start PostgreSQL service
sudo service postgresql start  # Ubuntu/Debian
brew services start postgresql # macOS

# Create database
createdb premium_hair

# Set DATABASE_URL in .env
DATABASE_URL=postgresql://localhost:5432/premium_hair
```

### Database Initialization

Initialize tables and seed data:
```bash
npm run init-db
```

Or simply start the server (it will auto-initialize):
```bash
npm start
```

### Database Schema

- **admins** - Admin users
- **customers** - Customer accounts
- **products** - Product catalog
- **orders** - Customer orders
- **order_items** - Order line items
- **payments** - Payment records
- **discounts** - Discount codes
- **returns** - Return requests
- **activity_logs** - Admin activity logs

### Connecting to Render PostgreSQL

When using Render's PostgreSQL database:

1. Create a PostgreSQL database in Render
2. Copy the **External Database URL** from Render dashboard
3. Set it as `DATABASE_URL` environment variable
4. The connection uses SSL automatically in production

Example Render DATABASE_URL format:
```
postgresql://user:password@dpg-xxxxx.oregon-postgres.render.com/dbname
```

## 🌐 Deployment to Render

### Step 1: Push to GitHub

1. Create a new repository named `backend-ecommerce`
2. Copy all files from this `backend` directory to the repository
3. Push to GitHub

### Step 2: Deploy to Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name:** premium-hair-backend
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (or paid for better performance)

### Step 3: Configure Environment Variables

Add these environment variables in Render:

```
NODE_ENV=production
JWT_SECRET=generate-a-strong-random-secret-here
JWT_EXPIRES_IN=24h
ADMIN_EMAIL=admin@premiumhairsa.co.za
ADMIN_PASSWORD=YourSecurePassword123!
ADMIN_NAME=Admin User
DATABASE_URL=<your-render-postgresql-external-url>
FRONTEND_URL=https://your-frontend-url.onrender.com
ADMIN_URL=https://your-admin-url.onrender.com
CORS_ORIGINS=https://premium-hair-admin.onrender.com,https://premium-hair-frontend.onrender.com
```

**Note:** Get the `DATABASE_URL` from your Render PostgreSQL database's "External Database URL" field.

### Step 4: Note Your Backend URL

After deployment, Render will provide a URL like:
```
https://premium-hair-backend.onrender.com
```

Use this URL in your admin and frontend applications.

## 🔗 Connecting Frontend Applications

### Admin Dashboard
The admin dashboard is in a separate repository: [Nhlobo/admin-ecommerce](https://github.com/Nhlobo/admin-ecommerce)

Configure the admin dashboard to point to this backend API by setting the API base URL to your deployed backend URL (e.g., `https://your-backend-url.onrender.com`).

### Customer Frontend
The customer frontend is in a separate repository: [Nhlobo/frontend-ecommerce](https://github.com/Nhlobo/frontend-ecommerce)

Configure the frontend application to point to this backend API for product listings and order creation.

## 📝 Sample Data

The database is initialized with sample data for testing:
- 3 sample products (wigs and extensions)
- 1 sample customer
- 1 sample order
- 1 sample payment

## 🛠️ Development

### Project Structure
```
backend-ecommerce/
├── server.js                    # Main server file
├── package.json                 # Dependencies
├── .env.example                 # Environment variables template
└── src/
    ├── config/
    │   ├── database.js          # Database configuration
    │   └── init-db.js           # Database initialization
    ├── middleware/
    │   └── auth.js              # Authentication middleware
    └── routes/
        ├── admin.js             # Admin API routes
        ├── auth.js              # Auth compatibility routes
        ├── products.js          # Products API routes
        └── orders.js            # Orders API routes
```

### Adding New Features

1. Create route file in `src/routes/`
2. Import and use in `server.js`
3. Add database queries as needed
4. Test endpoints

## 🐛 Troubleshooting

### Database Connection Issues

**PostgreSQL connection errors:**
1. Verify `DATABASE_URL` is set correctly
2. Check PostgreSQL service is running: `sudo service postgresql status`
3. For Render databases, ensure you're using the External Database URL
4. Check firewall settings allow connections to PostgreSQL port (default: 5432)

**SSL Connection Issues (Render):**
- The app automatically uses SSL in production (`NODE_ENV=production`)
- Render PostgreSQL requires SSL connections
- SSL is disabled for local development

**Database initialization fails:**
```bash
# Manually run initialization
npm run init-db

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log  # Ubuntu/Debian
```

### Migrating from SQLite to PostgreSQL

If you were previously using SQLite:

1. This version uses PostgreSQL - SQLite databases are not compatible
2. Set up a new PostgreSQL database
3. Run `npm run init-db` to create tables and seed data
4. Manual data migration would require exporting from SQLite and importing to PostgreSQL

### CORS Issues
Make sure your admin and frontend URLs are added to the CORS configuration in `server.js`.

### Port Already in Use
Change the PORT in your `.env` file or stop the process using port 3000.

## 📄 License

PROPRIETARY - Premium Hair Wigs & Extensions Pty (Ltd)
