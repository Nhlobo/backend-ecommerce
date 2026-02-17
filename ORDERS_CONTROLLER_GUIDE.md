# Orders Controller Guide

## Overview
The Orders Controller provides comprehensive order management functionality for both customers and administrators in the e-commerce platform.

## Table of Contents
- [Customer Routes](#customer-routes)
- [Admin Routes](#admin-routes)
- [Integration Examples](#integration-examples)
- [Database Schema](#database-schema)

---

## Customer Routes

### 1. Create Order
**Endpoint:** `POST /api/orders`  
**Authentication:** Required (JWT)  
**Middleware Required:** 
- Authentication middleware
- `validateCartTotals` middleware
- `validateOrderTotals` middleware

**Request Body:**
```json
{
  "items": [
    {
      "variant_id": "uuid",
      "quantity": 2
    }
  ],
  "shipping_address_id": "uuid",
  "shipping_cost": 99.00,
  "discount_code": "SAVE10",
  "customer_notes": "Please deliver after 3 PM"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "id": "uuid",
      "order_number": "ORD-20240115-0001",
      "user_id": "uuid",
      "status": "pending",
      "subtotal": 1000.00,
      "shipping_cost": 99.00,
      "tax": 165.00,
      "total": 1264.00,
      "shipping_address_id": "uuid",
      "customer_email": "customer@example.com",
      "customer_name": "John Doe",
      "placed_at": "2024-01-15T10:30:00.000Z",
      "created_at": "2024-01-15T10:30:00.000Z"
    },
    "items": [
      {
        "id": "uuid",
        "order_id": "uuid",
        "variant_id": "uuid",
        "product_name": "Brazilian Straight Hair",
        "variant_details": {
          "texture": "Straight",
          "length": "20 inch",
          "color": "Natural Black"
        },
        "quantity": 2,
        "price": 500.00,
        "subtotal": 1000.00
      }
    ]
  }
}
```

**Features:**
- ✅ Generates unique order number (ORD-YYYYMMDD-XXXX)
- ✅ Uses server-validated prices (never trusts frontend)
- ✅ Creates order and order items atomically (transaction)
- ✅ Clears user's cart after successful order
- ✅ Supports legacy fields for backward compatibility
- ✅ Stores shipping address details
- ✅ Records customer information
- ⚠️ Note: Stock is deducted only when payment is confirmed (via payment gateway webhook)

---

### 2. Get User Orders
**Endpoint:** `GET /api/orders`  
**Authentication:** Required (JWT)

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 10) - Items per page

**Example Request:**
```
GET /api/orders?page=1&limit=10
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "order_number": "ORD-20240115-0001",
        "status": "processing",
        "subtotal": 1000.00,
        "shipping_cost": 99.00,
        "tax": 165.00,
        "total": 1264.00,
        "placed_at": "2024-01-15T10:30:00.000Z",
        "items": [
          {
            "id": "uuid",
            "variant_id": "uuid",
            "product_name": "Brazilian Straight Hair",
            "variant_details": {
              "texture": "Straight",
              "length": "20 inch",
              "color": "Natural Black"
            },
            "quantity": 2,
            "price": 500.00,
            "subtotal": 1000.00
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 15,
      "totalPages": 2
    }
  }
}
```

**Features:**
- ✅ Filters orders by authenticated user
- ✅ Includes all order items with variant details
- ✅ Pagination support
- ✅ Sorted by creation date (newest first)

---

### 3. Get Order by ID
**Endpoint:** `GET /api/orders/:id`  
**Authentication:** Required (JWT)

**Example Request:**
```
GET /api/orders/550e8400-e29b-41d4-a716-446655440000
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "order_number": "ORD-20240115-0001",
    "user_id": "uuid",
    "status": "shipped",
    "subtotal": 1000.00,
    "shipping_cost": 99.00,
    "tax": 165.00,
    "total": 1264.00,
    "shipping_address_id": "uuid",
    "customer_notes": "Please deliver after 3 PM",
    "tracking_number": "TN123456789",
    "carrier": "PostNet",
    "placed_at": "2024-01-15T10:30:00.000Z",
    "shipped_at": "2024-01-16T14:20:00.000Z",
    "items": [
      {
        "id": "uuid",
        "variant_id": "uuid",
        "product_name": "Brazilian Straight Hair",
        "variant_details": {
          "texture": "Straight",
          "length": "20 inch",
          "color": "Natural Black"
        },
        "quantity": 2,
        "price": 500.00,
        "subtotal": 1000.00
      }
    ],
    "shipping_address": {
      "id": "uuid",
      "line1": "123 Main Street",
      "line2": "Apt 4B",
      "city": "Johannesburg",
      "province": "Gauteng",
      "postal_code": "2000",
      "country": "South Africa"
    }
  }
}
```

**Features:**
- ✅ Verifies order belongs to authenticated user
- ✅ Includes all order items with variant details
- ✅ Includes full shipping address information
- ✅ Returns 403 if user tries to access another user's order

---

## Admin Routes

### 4. Get All Orders (Admin)
**Endpoint:** `GET /api/admin/orders`  
**Authentication:** Required (Admin JWT)

**Query Parameters:**
- `status` (optional) - Filter by order status (pending, processing, shipped, delivered, cancelled)
- `payment_status` (optional) - Filter by payment status
- `date_from` (optional) - Filter orders from date (ISO 8601)
- `date_to` (optional) - Filter orders to date (ISO 8601)
- `search` (optional) - Search by order number or customer email
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20) - Items per page

**Example Request:**
```
GET /api/admin/orders?status=processing&date_from=2024-01-01&search=john&page=1&limit=20
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "order_number": "ORD-20240115-0001",
        "user_id": "uuid",
        "user_email": "customer@example.com",
        "user_name": "John Doe",
        "status": "processing",
        "payment_status": "completed",
        "subtotal": 1000.00,
        "shipping_cost": 99.00,
        "tax": 165.00,
        "total": 1264.00,
        "placed_at": "2024-01-15T10:30:00.000Z",
        "items_count": 2
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

**Features:**
- ✅ Multiple filter options
- ✅ Search by order number or email
- ✅ Date range filtering
- ✅ Includes user information
- ✅ Shows item count per order
- ✅ Pagination support

---

### 5. Update Order Status (Admin)
**Endpoint:** `PUT /api/admin/orders/:id/status`  
**Authentication:** Required (Admin JWT)

**Request Body:**
```json
{
  "status": "shipped"
}
```

**Valid Status Values:**
- `pending` - Order placed, awaiting processing
- `processing` - Order being prepared
- `shipped` - Order dispatched
- `delivered` - Order delivered to customer
- `cancelled` - Order cancelled

**Response (200):**
```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": {
    "id": "uuid",
    "order_number": "ORD-20240115-0001",
    "status": "shipped",
    "shipped_at": "2024-01-16T14:20:00.000Z",
    "updated_at": "2024-01-16T14:20:00.000Z"
  }
}
```

**Features:**
- ✅ Validates status values
- ✅ Automatically sets timestamps (shipped_at, delivered_at, cancelled_at)
- ✅ Logs admin action to admin_logs table
- ✅ Records IP address and admin ID
- ✅ Prevents duplicate timestamp updates

**Admin Log Entry:**
```json
{
  "admin_id": "uuid",
  "action": "update_order_status",
  "resource_type": "order",
  "resource_id": "uuid",
  "details": {
    "old_status": "processing",
    "new_status": "shipped",
    "order_number": "ORD-20240115-0001"
  },
  "ip_address": "192.168.1.1",
  "created_at": "2024-01-16T14:20:00.000Z"
}
```

---

## Integration Examples

### Express Route Setup

```javascript
// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/ordersController');
const { authenticateUser } = require('../middleware/auth');
const { validateCartTotals, validateOrderTotals } = require('../middleware/serverValidation');

// Customer routes
router.post('/', 
    authenticateUser,
    validateCartTotals,
    validateOrderTotals,
    ordersController.createOrder
);

router.get('/', 
    authenticateUser,
    ordersController.getUserOrders
);

router.get('/:id', 
    authenticateUser,
    ordersController.getOrderById
);

module.exports = router;
```

```javascript
// routes/adminOrderRoutes.js
const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/ordersController');
const { authenticateAdmin } = require('../middleware/auth');

// Admin routes
router.get('/', 
    authenticateAdmin,
    ordersController.getAllOrders
);

router.put('/:id/status', 
    authenticateAdmin,
    ordersController.updateOrderStatus
);

module.exports = router;
```

### Frontend Integration Example

```javascript
// Create Order
const createOrder = async (cartItems, shippingAddressId, customerNotes = '') => {
    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                items: cartItems,
                shipping_address_id: shippingAddressId,
                shipping_cost: 99.00,
                customer_notes: customerNotes
            })
        });

        const data = await response.json();
        
        if (data.success) {
            console.log('Order created:', data.data.order.order_number);
            return data.data;
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('Order creation failed:', error);
        throw error;
    }
};

// Get User Orders
const getUserOrders = async (page = 1, limit = 10) => {
    try {
        const response = await fetch(`/api/orders?page=${page}&limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        return data.data.orders;
    } catch (error) {
        console.error('Failed to fetch orders:', error);
        throw error;
    }
};

// Admin: Update Order Status
const updateOrderStatus = async (orderId, newStatus) => {
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ status: newStatus })
        });

        const data = await response.json();
        
        if (data.success) {
            console.log('Order status updated:', data.data);
            return data.data;
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('Status update failed:', error);
        throw error;
    }
};
```

---

## Database Schema

### Orders Table
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    subtotal DECIMAL(10, 2) NOT NULL,
    shipping_cost DECIMAL(10, 2) DEFAULT 0,
    tax DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    shipping_address_id UUID REFERENCES addresses(id),
    customer_email VARCHAR(255),
    customer_name VARCHAR(255),
    customer_phone VARCHAR(20),
    vat_amount DECIMAL(10, 2),
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2),
    payment_status VARCHAR(50) DEFAULT 'pending',
    tracking_number VARCHAR(100),
    carrier VARCHAR(100),
    placed_at TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    customer_notes TEXT,
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Order Items Table
```sql
CREATE TABLE order_items (
    id UUID PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id),
    product_name VARCHAR(255) NOT NULL,
    variant_details JSONB,
    quantity INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Admin Logs Table
```sql
CREATE TABLE admin_logs (
    id UUID PRIMARY KEY,
    admin_id UUID REFERENCES admins(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message (in development)"
}
```

### Common Error Codes:
- `400` - Bad Request (validation errors, invalid input)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (access denied)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

---

## Security Features

1. **Price Validation**: All prices are fetched from the database, never trusted from frontend
2. **Stock Validation**: Checks stock availability before order creation
3. **Order Ownership**: Verifies users can only access their own orders
4. **Transaction Safety**: Uses database transactions for atomicity
5. **Admin Logging**: All admin actions are logged with timestamps and IP addresses
6. **Input Sanitization**: All inputs are validated and sanitized

---

## Notes

- Order numbers are unique and sequential per day
- Cart is automatically cleared after successful order creation
- **Stock is deducted when payment is confirmed** (via payment gateway webhook), not at order creation
- All monetary amounts use DECIMAL(10,2) for precision
- Timestamps are automatically set based on status changes
- Legacy fields are maintained for backward compatibility
- VAT rate is configurable via environment variable (default: 15%)

---

## Environment Variables

```env
VAT_RATE=0.15  # Default VAT rate (15% for South Africa)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=premium_hair_ecommerce
DB_USER=postgres
DB_PASSWORD=your_password
```
