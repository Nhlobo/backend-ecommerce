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
DATABASE_PATH=./database.sqlite
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

The application uses SQLite for simplicity. The database file is created at `./database.sqlite` by default.

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
DATABASE_PATH=/opt/render/project/src/database.sqlite
FRONTEND_URL=https://your-frontend-url.onrender.com
ADMIN_URL=https://your-admin-url.onrender.com
CORS_ORIGINS=https://premium-hair-admin.onrender.com,https://premium-hair-frontend.onrender.com
```

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

### Database Issues
If you encounter database errors, delete `database.sqlite` and restart the server to recreate it.

### CORS Issues
Make sure your admin and frontend URLs are added to the CORS configuration in `server.js`.

### Port Already in Use
Change the PORT in your `.env` file or stop the process using port 3000.

## 📄 License

PROPRIETARY - Premium Hair Wigs & Extensions Pty (Ltd)
