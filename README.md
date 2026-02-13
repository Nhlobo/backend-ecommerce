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

### Public Endpoints

#### Health Check
```
GET /health
```

#### Products
```
GET /api/products                    # Get all products
GET /api/products/:id                # Get product by ID
GET /api/products/categories/list    # Get all categories
```

#### Orders
```
POST /api/orders                     # Create new order
GET /api/orders/:id                  # Get order by ID
```

### Admin Endpoints (Require Authentication)

#### Authentication
```
POST /api/admin/login                # Admin login
POST /api/admin/logout               # Admin logout
GET /api/admin/verify                # Verify token

# Compatibility aliases for admin UIs expecting /api/auth/*
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/verify
```

#### Dashboard
```
GET /api/admin/dashboard/overview    # Get dashboard metrics
```

#### Orders
```
GET /api/admin/orders                # Get all orders
```

#### Payments
```
GET /api/admin/payments              # Get all payments
```

#### Customers
```
GET /api/admin/customers             # Get all customers
```

#### Products
```
GET /api/admin/products              # Get all products (admin view)
```

#### Discounts
```
GET /api/admin/discounts             # Get all discounts
```

#### Returns
```
GET /api/admin/returns               # Get all returns
```

#### Compliance
```
GET /api/admin/compliance/vat              # Get VAT records
GET /api/admin/compliance/activity-logs    # Get activity logs
GET /api/admin/compliance/policies         # Get compliance policies
```

#### Security
```
GET /api/admin/security/events       # Get security events
```

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. To access protected endpoints:

1. Login via `/api/admin/login` with email and password
2. Receive a JWT token in the response
3. Include the token in subsequent requests:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

### Default Admin Credentials
- **Email:** admin@premiumhairsa.co.za
- **Password:** Admin@123456

**⚠️ Change these credentials in production!**

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
