# Deployment Guide - Premium Hair Backend API

## Overview
This guide provides step-by-step instructions for deploying the Premium Hair Backend API to production.

## Prerequisites
- PostgreSQL database (Render PostgreSQL recommended)
- Node.js >= 14.0.0
- Git repository access

## Environment Setup

### 1. Create PostgreSQL Database

#### Using Render
1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "PostgreSQL"
3. Configure database:
   - **Name**: premium-hair-db
   - **Region**: Choose closest to your users
   - **PostgreSQL Version**: 15 or later
   - **Instance Type**: Free or paid based on needs
4. Copy the **External Database URL** for use in environment variables

### 2. Configure Environment Variables

Set these environment variables in your deployment platform:

```env
# Server Configuration
NODE_ENV=production
PORT=3000

# JWT Configuration (IMPORTANT: Use strong secret in production!)
JWT_SECRET=<generate-strong-random-secret-at-least-32-chars>
JWT_EXPIRES_IN=24h

# Admin Credentials (Change from defaults!)
ADMIN_EMAIL=admin@premiumhairsa.co.za
ADMIN_PASSWORD=<use-strong-password-min-8-chars>
ADMIN_NAME=Admin User

# Database Configuration
DATABASE_URL=<your-render-postgresql-external-url>

# Frontend URLs (Update with your production URLs)
FRONTEND_URL=https://frontend-ecommerce-p6sm.onrender.com
ADMIN_URL=https://admin-ecommerce-gcuh.onrender.com
CORS_ORIGINS=https://admin-ecommerce-gcuh.onrender.com,https://frontend-ecommerce-p6sm.onrender.com

# Rate Limiting (Optional - defaults provided)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Pagination (Optional - defaults provided)
PAGINATION_MAX_LIMIT=100
PAGINATION_DEFAULT_LIMIT=20
```

### 3. Deploy to Render

#### Option A: Using Render Dashboard
1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure service:
   - **Name**: backend-ecommerce
   - **Environment**: Node
   - **Region**: Same as database
   - **Branch**: main (or your production branch)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free or paid based on needs

5. Add all environment variables from step 2

6. Click "Create Web Service"

#### Option B: Using render.yaml (Infrastructure as Code)
Create `render.yaml` in repository root:

```yaml
services:
  - type: web
    name: backend-ecommerce
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: JWT_SECRET
        generateValue: true
      - key: DATABASE_URL
        fromDatabase:
          name: premium-hair-db
          property: connectionString
      # Add other env vars as needed
```

### 4. Verify Deployment

After deployment completes:

1. **Check Health Endpoint**
```bash
curl https://your-backend-url.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "Premium Hair Backend API"
}
```

2. **Test Admin Login**
```bash
curl -X POST https://your-backend-url.onrender.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@premiumhairsa.co.za","password":"your-password"}'
```

3. **Test Admin Health Check**
```bash
curl https://your-backend-url.onrender.com/api/admin/health \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Security Checklist

Before going to production:

- [ ] Changed default admin password
- [ ] Generated strong JWT_SECRET (at least 32 characters)
- [ ] Configured CORS with production URLs only
- [ ] Enabled SSL/HTTPS (automatic on Render)
- [ ] Verified database connection uses SSL
- [ ] Set NODE_ENV=production
- [ ] Tested all authentication endpoints
- [ ] Verified rate limiting is working
- [ ] Reviewed activity logs for suspicious activity
- [ ] Backed up initial database state

## Post-Deployment Tasks

### 1. Create Additional Admin Users
```bash
curl -X POST https://your-backend-url.onrender.com/api/admin/users \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@premiumhairsa.co.za",
    "password": "SecurePassword123",
    "full_name": "Staff Member"
  }'
```

### 2. Add Sample Products (if needed)
Use the POST /api/admin/products endpoint to add your product catalog.

### 3. Configure Frontend Applications

Update your frontend applications to point to the deployed backend:

**Admin Dashboard**: Set `REACT_APP_API_URL=https://your-backend-url.onrender.com`

**Customer Frontend**: Set `REACT_APP_API_URL=https://your-backend-url.onrender.com`

## Monitoring & Maintenance

### Logs
View logs in Render Dashboard → Your Service → Logs

### Database Backups
Render automatically backs up PostgreSQL databases daily (paid plans)

### Performance Monitoring
Monitor these metrics:
- Response times
- Error rates
- Database connection pool usage
- Rate limit hits

### Common Issues

#### "ECONNREFUSED" Database Error
- Verify DATABASE_URL is correct
- Check database is running
- Verify network connectivity

#### CORS Errors
- Verify CORS_ORIGINS includes your frontend URLs
- Check FRONTEND_URL and ADMIN_URL are set correctly

#### 401 Authentication Errors
- Verify JWT_SECRET is set
- Check token hasn't expired
- Verify Authorization header format: "Bearer TOKEN"

## Support

For issues or questions:
- Check logs first
- Review error messages
- Verify environment variables
- Test endpoints with curl
- Check database connectivity

## API Documentation

Complete API documentation available in README.md
- 41 endpoints documented
- Request/response examples included
- Authentication flow documented
