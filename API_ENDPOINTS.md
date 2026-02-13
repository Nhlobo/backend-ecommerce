# API Endpoints Documentation

## Overview

This document lists all 43 API endpoints available in the Premium Hair E-commerce Backend API.

**Base URL**: `http://localhost:3000/api` (development) or `https://your-domain.com/api` (production)

**Authentication**: Most admin endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

---

## 1. Health & System (1 endpoint)

### GET /api/health
Check server health status.

**Auth**: None required

**Response**:
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2026-02-13T17:59:16.400Z"
}
```

---

## 2. Admin Authentication (4 endpoints)

### POST /api/admin/login
Admin login to get JWT token.

**Auth**: None required

**Body**:
```json
{
  "email": "admin@premiumhairsa.co.za",
  "password": "your-password"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "jwt-token-here",
    "admin": {
      "id": "uuid",
      "email": "admin@premiumhairsa.co.za",
      "fullName": "System Administrator",
      "role": "super_admin"
    }
  }
}
```

### POST /api/admin/logout
Logout and invalidate JWT token.

**Auth**: Admin JWT required

**Response**:
```json
{
  "success": true,
  "message": "Logout successful"
}
```

### GET /api/admin/me
Get current admin user information.

**Auth**: Admin JWT required

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "admin@premiumhairsa.co.za",
    "full_name": "System Administrator",
    "role": "super_admin",
    "last_login": "2026-02-13T17:59:16.400Z"
  }
}
```

### POST /api/admin/change-password
Change admin password.

**Auth**: Admin JWT required

**Body**:
```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password"
}
```

---

## 3. Customer Authentication (3 endpoints)

### POST /api/auth/register
Register a new customer account.

**Auth**: None required

**Body**:
```json
{
  "email": "customer@example.com",
  "password": "SecurePassword123",
  "full_name": "John Doe",
  "phone": "+27 82 123 4567"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "token": "jwt-token-here",
    "customer": {
      "id": "uuid",
      "email": "customer@example.com",
      "full_name": "John Doe",
      "phone": "+27 82 123 4567"
    }
  }
}
```

### POST /api/auth/login
Customer login.

**Auth**: None required

**Body**:
```json
{
  "email": "customer@example.com",
  "password": "SecurePassword123"
}
```

### GET /api/auth/user
Get current customer information.

**Auth**: Customer JWT required

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "customer@example.com",
    "full_name": "John Doe",
    "phone": "+27 82 123 4567",
    "email_verified": false,
    "is_active": true,
    "created_at": "2026-02-13T17:59:16.400Z"
  }
}
```

---

## 4. Public Products (5 endpoints)

### GET /api/products
Get all products with filtering and pagination.

**Auth**: None required

**Query Parameters**:
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)
- `category` (string): Filter by category
- `search` (string): Search in name and description
- `min_price` (number): Minimum price filter
- `max_price` (number): Maximum price filter
- `sort` (string): Sort field (created_at, price_incl_vat, name, popularity)
- `order` (string): Sort order (asc, desc)

**Example**: `/api/products?category=wigs&page=1&limit=20&sort=price_incl_vat&order=asc`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Premium Lace Front Wig",
      "description": "100% Human Hair...",
      "category": "wigs",
      "base_price": 1500.00,
      "price_incl_vat": 1725.00,
      "stock_quantity": 15,
      "sku": "WIG-LF-18-NBK",
      "is_featured": true,
      "image_url": "assets/images/products/wig1.jpg"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "pages": 3
  }
}
```

### GET /api/products/featured
Get featured products.

**Auth**: None required

**Query Parameters**:
- `limit` (number): Max items to return (default: 10)

### GET /api/products/search
Search products by keyword.

**Auth**: None required

**Query Parameters**:
- `q` (string): Search query (min 2 characters)
- `limit` (number): Max results (default: 20)

**Example**: `/api/products/search?q=lace`

### GET /api/products/:id
Get single product details.

**Auth**: None required

**Example**: `/api/products/123e4567-e89b-12d3-a456-426614174000`

### GET /api/categories
Get all product categories.

**Auth**: None required

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "category": "wigs",
      "product_count": "25"
    },
    {
      "category": "extensions",
      "product_count": "18"
    }
  ]
}
```

---

## 5. Orders (2 endpoints)

### POST /api/orders
Create a new customer order.

**Auth**: None required (but customer info required)

**Body**:
```json
{
  "customer_email": "customer@example.com",
  "customer_name": "John Doe",
  "customer_phone": "+27 82 123 4567",
  "items": [
    {
      "product_id": "uuid",
      "quantity": 2
    }
  ],
  "shipping_address": {
    "street": "123 Main St",
    "city": "Cape Town",
    "province": "Western Cape",
    "postal_code": "8001",
    "country": "South Africa"
  },
  "billing_address": {
    "street": "123 Main St",
    "city": "Cape Town",
    "province": "Western Cape",
    "postal_code": "8001",
    "country": "South Africa"
  },
  "discount_code": "SAVE10"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order_id": "uuid",
    "order_number": "ORD-1707854356400-ABC123XYZ",
    "total_amount": 1725.00,
    "items": [...]
  }
}
```

### GET /api/orders/track/:orderNumber
Track order status by order number.

**Auth**: None required

**Example**: `/api/orders/track/ORD-1707854356400-ABC123XYZ`

**Response**:
```json
{
  "success": true,
  "data": {
    "order_number": "ORD-1707854356400-ABC123XYZ",
    "customer_name": "John Doe",
    "total_amount": 1725.00,
    "status": "processing",
    "payment_status": "paid",
    "placed_at": "2026-02-13T10:00:00Z",
    "shipped_at": null,
    "delivered_at": null,
    "items": [...]
  }
}
```

---

## 6. Contact & Newsletter (2 endpoints)

### POST /api/contact
Submit contact form.

**Auth**: None required

**Body**:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+27 82 123 4567",
  "subject": "Product Inquiry",
  "message": "I would like to know more about..."
}
```

### POST /api/newsletter
Subscribe to newsletter.

**Auth**: None required

**Body**:
```json
{
  "email": "customer@example.com",
  "name": "John Doe"
}
```

---

## 7. Discount Codes (1 endpoint)

### POST /api/discount/validate
Validate a discount code before checkout.

**Auth**: None required

**Body**:
```json
{
  "code": "SAVE10",
  "order_amount": 1500.00
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "code": "SAVE10",
    "description": "10% off all orders",
    "discount_type": "percentage",
    "discount_value": 10,
    "discount_amount": 150.00,
    "final_amount": 1350.00
  }
}
```

---

## 8. Wishlist (3 endpoints)

### GET /api/wishlist
Get customer wishlist.

**Auth**: Customer JWT required

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "added_at": "2026-02-13T10:00:00Z",
      "name": "Premium Lace Front Wig",
      "description": "...",
      "price_incl_vat": 1725.00,
      "image_url": "...",
      "stock_quantity": 15
    }
  ]
}
```

### POST /api/wishlist
Add product to wishlist.

**Auth**: Customer JWT required

**Body**:
```json
{
  "product_id": "uuid"
}
```

### DELETE /api/wishlist/:id
Remove product from wishlist.

**Auth**: Customer JWT required

**Example**: `/api/wishlist/123e4567-e89b-12d3-a456-426614174000`

---

## 9. Admin - Dashboard (1 endpoint)

### GET /api/admin/dashboard/overview
Get dashboard statistics.

**Auth**: Admin JWT required

**Response**:
```json
{
  "success": true,
  "data": {
    "ordersToday": {
      "count": 15,
      "revenue": 25875.00
    },
    "pendingOrders": 8,
    "lowStockProducts": 3,
    "weekRevenue": 125000.00,
    "recentTransactions": [...]
  }
}
```

---

## 10. Admin - Orders (3 endpoints)

### GET /api/admin/orders
Get all orders with filtering.

**Auth**: Admin JWT required

**Query Parameters**:
- `page`, `limit`, `status`, `payment_status`, `search`

### GET /api/admin/orders/:id
Get order details with items and payment info.

**Auth**: Admin JWT required

### PUT /api/admin/orders/:id
Update order details.

**Auth**: Admin JWT required

**Body**: Any order fields to update (status, tracking_number, etc.)

---

## 11. Admin - Customers (2 endpoints)

### GET /api/admin/customers
Get all customers with search.

**Auth**: Admin JWT required

**Query Parameters**:
- `page`, `limit`, `search`

### GET /api/admin/customers/:id
Get customer details with order history and addresses.

**Auth**: Admin JWT required

---

## 12. Admin - Products (4 endpoints)

### GET /api/admin/products
Get all products (including inactive).

**Auth**: Admin JWT required

**Query Parameters**:
- `page`, `limit`, `category`, `search`, `low_stock`

### POST /api/admin/products
Create new product.

**Auth**: Admin JWT required

**Body**:
```json
{
  "name": "New Product",
  "description": "Product description",
  "category": "wigs",
  "base_price": 1500.00,
  "stock_quantity": 10,
  "sku": "PROD-001",
  "low_stock_threshold": 5
}
```

### PUT /api/admin/products/:id
Update product.

**Auth**: Admin JWT required

### DELETE /api/admin/products/:id
Delete product.

**Auth**: Admin JWT required

---

## 13. Admin - Payments (1 endpoint)

### GET /api/admin/payments
Get all payments with filtering.

**Auth**: Admin JWT required

**Query Parameters**:
- `page`, `limit`, `status`, `payment_method`

---

## 14. Admin - Discounts (2 endpoints)

### GET /api/admin/discounts
Get all discount codes.

**Auth**: Admin JWT required

### POST /api/admin/discounts
Create discount code.

**Auth**: Admin JWT required

**Body**:
```json
{
  "code": "SUMMER2026",
  "description": "Summer Sale 2026",
  "discount_type": "percentage",
  "discount_value": 15,
  "min_order_value": 500,
  "max_discount_amount": 1000,
  "usage_limit": 100,
  "starts_at": "2026-06-01",
  "expires_at": "2026-08-31"
}
```

---

## 15. Admin - Returns & Refunds (3 endpoints)

### GET /api/admin/returns
Get all returns with filtering.

**Auth**: Admin JWT required

### PUT /api/admin/returns/:id
Update return status.

**Auth**: Admin JWT required

### GET /api/admin/refunds
Get all refunds.

**Auth**: Admin JWT required

---

## 16. Admin - Reports (2 endpoints)

### GET /api/admin/reports/sales
Get sales report.

**Auth**: Admin JWT required

**Query Parameters**:
- `start_date`, `end_date`, `period` (day or month)

### GET /api/admin/reports/products
Get product performance report.

**Auth**: Admin JWT required

---

## 17. Admin - Compliance (2 endpoints)

### GET /api/admin/compliance/vat
Get VAT records.

**Auth**: Admin JWT required

**Query Parameters**:
- `page`, `limit`, `start_date`, `end_date`

### GET /api/admin/compliance/policies
Get policy documents.

**Auth**: Admin JWT required

---

## 18. Admin - Logs (2 endpoints)

### GET /api/admin/logs/activity
Get activity logs.

**Auth**: Admin JWT required

**Query Parameters**:
- `page`, `limit`, `severity`, `action`

### GET /api/admin/logs/security
Get security events.

**Auth**: Admin JWT required

**Query Parameters**:
- `page`, `limit`, `severity`, `resolved`

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "message": "Error description"
}
```

Common HTTP status codes:
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limiting

- API endpoints: 100 requests per 15 minutes
- Admin login: 5 attempts per 15 minutes

---

## CORS

In development, all origins are allowed.

In production, only configured origins (FRONTEND_URL, ADMIN_URL) are allowed.

---

**Total Endpoints: 43**

For more details, see the source code in:
- `backend-ecommerce/server.js` - Health & Admin Auth
- `backend-ecommerce/routes/publicRoutes.js` - Public/Customer routes
- `backend-ecommerce/routes/adminRoutes.js` - Admin routes
