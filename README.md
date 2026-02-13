# Premium Hair Wigs & Extensions - Backend API

**Standalone REST API Server for Premium Hair E-commerce Platform**

This is a standalone backend API server migrated from the monorepo. It serves as an independent REST API for the Premium Hair Wigs & Extensions e-commerce platform, connecting to separate frontend and admin dashboard deployments.

## 🚀 Features

- **43+ RESTful API Endpoints** for complete e-commerce functionality
- **JWT Authentication & Authorization** for admin and customer access
- **PostgreSQL Database** integration with connection pooling
- **Secure Password Hashing** with bcrypt
- **Rate Limiting & Brute-force Protection**
- **CORS Configuration** for standalone frontend and admin
- **Comprehensive Logging** and activity monitoring
- **POPIA & VAT Compliance** for South African market
- **PayFast Integration** ready for payment processing

## 📁 Project Structure

```
backend-ecommerce/
├── server.js              # Main Express server (API-only, no frontend serving)
├── controllers/           # Route controllers
│   └── authController.js
├── middleware/            # Authentication, validation, rate limiting
│   ├── auth.js
│   ├── logger.js
│   ├── rateLimiter.js
│   └── validator.js
├── routes/                # API route definitions
│   ├── adminRoutes.js
│   └── publicRoutes.js
├── db/                    # Database connection and schema
│   ├── connection.js
│   ├── init.js
│   └── schema.sql
├── .env.example           # Environment variables template
├── .render.yaml           # Render deployment configuration
├── package.json
└── API_ENDPOINTS.md       # Complete API documentation
```

## 🔧 Prerequisites

- **Node.js** 14+ and npm
- **PostgreSQL** 12+
- **Git** for version control

## 📦 Local Installation

### 1. Clone Repository

```bash
git clone https://github.com/Nhlobo/backend-ecommerce.git
cd backend-ecommerce
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server
NODE_ENV=development
PORT=5000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/premium_hair_ecommerce
# Or configure individually:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=premium_hair_ecommerce
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=24h

# Admin Account (will be created on first db init)
ADMIN_EMAIL=admin@premiumhairsa.co.za
ADMIN_PASSWORD=ChangeThisPassword123!

# CORS - Frontend and Admin URLs
FRONTEND_URL=http://localhost:8000
ADMIN_URL=http://localhost:8001
```

### 4. Setup Database

Create the PostgreSQL database:

```bash
createdb premium_hair_ecommerce
```

Initialize the database schema and create admin user:

```bash
npm run init-db
```

This will:
- Create all necessary tables
- Set up indexes and constraints
- Create the default admin user

### 5. Start Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The API will be available at: `http://localhost:5000/api`

## 🌐 Deployment

### Deploy to Render

This repository includes a `.render.yaml` configuration file for easy deployment.

#### Step 1: Create Render Account

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Sign up or log in with GitHub

#### Step 2: Deploy Database

1. Click **"New +"** → **"PostgreSQL"**
2. Configure:
   - **Name**: `premium-hair-ecommerce-db`
   - **Database**: `premium_hair_ecommerce`
   - **Region**: Choose closest to your users
   - **PostgreSQL Version**: 15 or higher
   - **Plan**: Free (or appropriate tier)
3. Click **"Create Database"**
4. Save the **Internal Database URL**

#### Step 3: Deploy Backend API

1. Click **"New +"** → **"Web Service"**
2. Connect your `backend-ecommerce` repository
3. Configure:
   - **Name**: `premium-hair-backend-api`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or appropriate tier)

#### Step 4: Configure Environment Variables

Add these environment variables in Render:

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | Required |
| `PORT` | `5000` | Will be overridden by Render |
| `DATABASE_URL` | _From database_ | Internal Database URL |
| `JWT_SECRET` | _Generate strong secret_ | Use Render's generate feature |
| `JWT_EXPIRES_IN` | `24h` | Token expiration |
| `ADMIN_EMAIL` | `admin@premiumhairsa.co.za` | Admin login email |
| `ADMIN_PASSWORD` | _Set strong password_ | **Change immediately** |
| `FRONTEND_URL` | `https://nhlobo.github.io` | Your frontend URL |
| `ADMIN_URL` | `https://your-admin.onrender.com` | Your admin dashboard URL |
| `RATE_LIMIT_WINDOW_MS` | `900000` | 15 minutes |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `LOGIN_RATE_LIMIT_MAX` | `5` | Max login attempts |
| `BCRYPT_ROUNDS` | `12` | Password hashing rounds |

#### Step 5: Initialize Database

After deployment, run the database initialization:

1. Open Render Shell for your web service
2. Run: `npm run init-db`
3. Verify admin user is created

#### Step 6: Update CORS Origins

After deploying frontend and admin:

1. Update `FRONTEND_URL` and `ADMIN_URL` environment variables
2. Trigger a redeploy

### Alternative: Deploy to Heroku

Create a `Procfile`:

```
web: npm start
```

Deploy:

```bash
heroku create premium-hair-backend
heroku addons:create heroku-postgresql:mini
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret
# Add other environment variables...
git push heroku main
heroku run npm run init-db
```

## 🔐 CORS Configuration

The backend is configured to accept requests from:

- **Frontend (Customer)**: `https://nhlobo.github.io`
- **Admin Dashboard**: Your admin deployment URL
- **Local Development**:
  - `http://localhost:8000` (Frontend)
  - `http://localhost:8001` (Admin)

To modify allowed origins, update the `allowedOrigins` array in `server.js` or use environment variables.

## 📚 API Documentation

### Base URL

- **Production**: `https://your-backend.onrender.com/api`
- **Development**: `http://localhost:5000/api`

### Authentication

Most admin endpoints require JWT authentication. Include the token in requests:

```
Authorization: Bearer <your-jwt-token>
```

### API Endpoints (43 Total)

See [API_ENDPOINTS.md](./API_ENDPOINTS.md) for complete documentation.

#### Quick Reference

**Authentication** (4 endpoints)
- `POST /api/admin/login` - Admin login
- `POST /api/admin/logout` - Admin logout
- `GET /api/admin/me` - Get current admin
- `POST /api/admin/change-password` - Change password

**Admin - Products** (9 endpoints)
- `GET /api/admin/products` - List all products
- `POST /api/admin/products` - Create product
- `GET /api/admin/products/:id` - Get product details
- `PUT /api/admin/products/:id` - Update product
- `DELETE /api/admin/products/:id` - Delete product
- _...and more_

**Admin - Orders** (8 endpoints)
- `GET /api/admin/orders` - List all orders
- `GET /api/admin/orders/:id` - Get order details
- `PUT /api/admin/orders/:id/status` - Update order status
- _...and more_

**Public - Products** (5 endpoints)
- `GET /api/products` - List products (with filters)
- `GET /api/products/:id` - Get product details
- `GET /api/products/search` - Search products
- _...and more_

**Public - Orders** (4 endpoints)
- `POST /api/orders` - Create order
- `GET /api/orders/:id` - Get order details
- _...and more_

**Customer Auth** (3 endpoints)
- `POST /api/auth/register` - Customer registration
- `POST /api/auth/login` - Customer login
- `GET /api/auth/me` - Get customer profile

**Dashboard** (5 endpoints)
- `GET /api/admin/dashboard/overview` - Dashboard stats
- `GET /api/admin/analytics/revenue` - Revenue analytics
- _...and more_

## 🗄️ Database Schema

The database includes these main tables:

- **admin_users** - Admin authentication
- **admin_sessions** - Active admin sessions
- **login_attempts** - Brute-force protection
- **customers** - Customer accounts
- **customer_addresses** - Customer addresses
- **products** - Product catalog
- **product_variants** - Product variations (color, size, etc.)
- **orders** - Customer orders
- **order_items** - Individual items in orders
- **reviews** - Product reviews
- **discount_codes** - Promotional codes
- **admin_activity_log** - Activity tracking

See `db/schema.sql` for complete schema.

## 🛡️ Security Features

- **Helmet.js** - Security headers
- **Rate Limiting** - Prevent abuse
- **JWT Tokens** - Secure authentication
- **Bcrypt** - Password hashing (12 rounds)
- **Brute-force Protection** - Login attempt tracking
- **CORS** - Controlled cross-origin access
- **Input Validation** - Express validator
- **SQL Injection Prevention** - Parameterized queries

## 🧪 Testing

Health check endpoint:

```bash
curl http://localhost:5000/api/health
```

Expected response:

```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2026-02-13T18:00:00.000Z"
}
```

## 📝 Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | Environment mode |
| `PORT` | Yes | `5000` | Server port |
| `DATABASE_URL` | Yes* | - | PostgreSQL connection string |
| `DB_HOST` | Yes* | `localhost` | Database host |
| `DB_PORT` | Yes* | `5432` | Database port |
| `DB_NAME` | Yes* | - | Database name |
| `DB_USER` | Yes* | - | Database user |
| `DB_PASSWORD` | Yes* | - | Database password |
| `JWT_SECRET` | Yes | - | JWT signing secret |
| `JWT_EXPIRES_IN` | No | `24h` | Token expiration |
| `ADMIN_EMAIL` | Yes | - | Default admin email |
| `ADMIN_PASSWORD` | Yes | - | Default admin password |
| `FRONTEND_URL` | No | - | Frontend origin URL |
| `ADMIN_URL` | No | - | Admin dashboard origin URL |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | No | `100` | Max requests per window |
| `LOGIN_RATE_LIMIT_MAX` | No | `5` | Max login attempts |
| `BCRYPT_ROUNDS` | No | `12` | Password hashing rounds |

_* Either `DATABASE_URL` OR individual DB_* variables required_

## 🚨 Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
pg_isready

# Test connection
psql -h localhost -U postgres -d premium_hair_ecommerce
```

### CORS Errors

- Verify `FRONTEND_URL` and `ADMIN_URL` are set correctly
- Check that frontend is using the correct backend URL
- Ensure credentials are included in frontend requests

### Rate Limiting

If you're hitting rate limits during development:
- Adjust `RATE_LIMIT_MAX_REQUESTS` in `.env`
- Or set `NODE_ENV=development` to allow all origins

### Port Already in Use

```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>
```

## 📜 License

PROPRIETARY - Premium Hair Wigs & Extensions Pty (Ltd)

## 📧 Support

For support, email: support@premiumhairsa.co.za

## 🔗 Related Repositories

- **Frontend**: [Nhlobo/frontend-ecommerce](https://github.com/Nhlobo/frontend-ecommerce)
- **Admin Dashboard**: [Nhlobo/admin-ecommerce](https://github.com/Nhlobo/admin-ecommerce)
- **Original Monorepo**: [Nhlobo/ecommerce](https://github.com/Nhlobo/ecommerce)

---

**Note**: This is a standalone backend API. It does NOT serve static files for frontend or admin. Those are deployed separately and communicate with this API via CORS-enabled requests.
