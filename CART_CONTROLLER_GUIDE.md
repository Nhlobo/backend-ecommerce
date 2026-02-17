# Cart Controller Guide

## Overview
The cart controller (`controllers/cartController.js`) provides comprehensive cart management functionality for both authenticated users and guest users.

## Features

### 1. **Dual User Support**
- **Authenticated Users**: Cart is tied to `user_id`
- **Guest Users**: Cart is tied to `session_id` (UUID)
- Automatic session creation for new guests

### 2. **Session Management**
- Session ID can be provided via:
  - Header: `x-session-id`
  - Cookie: `session_id`
- Auto-generates UUID if not provided
- Returns session_id in response for tracking

### 3. **Stock Validation**
- Real-time stock checking on add/update
- Prevents over-ordering
- Clear error messages for insufficient stock

### 4. **Price Integrity**
- Always fetches prices from database
- Supports sale prices
- Calculates totals server-side

## API Endpoints

### 1. Get Cart
```
GET /api/cart
```

**Headers:**
- `x-session-id`: (optional) Session ID for guest users
- `Authorization`: (optional) Bearer token for authenticated users

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "variant_id": "uuid",
        "product_id": "uuid",
        "name": "Product Name",
        "description": "Product description",
        "category": "Category",
        "price": 299.99,
        "original_price": 349.99,
        "quantity": 2,
        "stock": 50,
        "sku": "SKU-123",
        "variant_details": {
          "texture": "Straight",
          "length": "14\"",
          "color": "Natural Black"
        },
        "image_url": "https://...",
        "item_total": 599.98
      }
    ],
    "subtotal": 599.98,
    "total_items": 1,
    "session_id": "uuid"
  }
}
```

### 2. Add to Cart
```
POST /api/cart
```

**Request Body:**
```json
{
  "variant_id": "uuid",
  "quantity": 2
}
```

**Validation:**
- `variant_id`: Required, must exist and be active
- `quantity`: Required, must be positive integer
- Stock availability checked
- If item exists, quantities are added together

**Response:** Returns updated cart (same as GET)

### 3. Update Cart Item
```
PUT /api/cart/:itemId
```

**Request Body:**
```json
{
  "quantity": 3
}
```

**Validation:**
- `quantity`: Must be non-negative integer
- If quantity = 0, item is removed
- Stock availability checked

**Response:** Returns updated cart

### 4. Remove Cart Item
```
DELETE /api/cart/:itemId
```

**Response:** Returns updated cart

### 5. Clear Cart
```
DELETE /api/cart
```

**Response:**
```json
{
  "success": true,
  "message": "Cart cleared successfully",
  "data": {
    "items": [],
    "subtotal": 0,
    "total_items": 0
  }
}
```

### 6. Validate Cart
```
POST /api/cart/validate
```

**Purpose:** Server-side validation before checkout

**Response:**
```json
{
  "success": true,
  "validation": {
    "valid": true,
    "errors": ["Product X is no longer available"],
    "warnings": ["Product Y: Only 5 available (requested 10)"]
  },
  "data": {
    "items": [...],
    "subtotal": 599.98,
    "total_items": 1
  }
}
```

**Checks:**
- Product availability (active status)
- Stock availability
- Price accuracy
- Cart consistency

## Usage Examples

### Example Routes Setup
```javascript
const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { authenticateOptional } = require('../middleware/auth');
const { validateCartQuantity } = require('../middleware/serverValidation');

// All cart routes support both authenticated and guest users
router.get('/cart', authenticateOptional, cartController.getCart);
router.post('/cart', authenticateOptional, validateCartQuantity, cartController.addToCart);
router.put('/cart/:itemId', authenticateOptional, cartController.updateCartItem);
router.delete('/cart/:itemId', authenticateOptional, cartController.removeCartItem);
router.delete('/cart', authenticateOptional, cartController.clearCart);
router.post('/cart/validate', authenticateOptional, cartController.validateCart);

module.exports = router;
```

### Frontend Integration

#### Guest User Flow
```javascript
// Initial cart fetch - will create session
const response = await fetch('/api/cart', {
  headers: {
    'x-session-id': localStorage.getItem('session_id') || ''
  }
});
const data = await response.json();

// Store session ID for future requests
localStorage.setItem('session_id', data.data.session_id);
```

#### Authenticated User Flow
```javascript
// Cart automatically tied to user account
const response = await fetch('/api/cart', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

#### Add to Cart
```javascript
const response = await fetch('/api/cart', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-session-id': localStorage.getItem('session_id')
  },
  body: JSON.stringify({
    variant_id: 'uuid',
    quantity: 2
  })
});
```

#### Update Quantity
```javascript
const response = await fetch(`/api/cart/${itemId}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'x-session-id': localStorage.getItem('session_id')
  },
  body: JSON.stringify({
    quantity: 3
  })
});
```

#### Validate Before Checkout
```javascript
const response = await fetch('/api/cart/validate', {
  method: 'POST',
  headers: {
    'x-session-id': localStorage.getItem('session_id')
  }
});

const { validation } = await response.json();
if (!validation.valid) {
  // Show errors to user
  console.error(validation.errors);
}
```

## Database Schema

### Carts Table
```sql
CREATE TABLE carts (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    session_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Cart Items Table
```sql
CREATE TABLE cart_items (
    id UUID PRIMARY KEY,
    cart_id UUID REFERENCES carts(id),
    variant_id UUID REFERENCES product_variants(id),
    quantity INTEGER NOT NULL,
    added_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

## Security Features

1. **Price Validation**: Always fetches prices from database, never trusts client
2. **Stock Verification**: Real-time stock checks prevent overselling
3. **Cart Ownership**: Validates cart/item belongs to requesting user/session
4. **Input Sanitization**: All inputs validated for type and range
5. **SQL Injection Protection**: Uses parameterized queries

## Error Handling

All endpoints return consistent error format:
```json
{
  "success": false,
  "message": "Error description"
}
```

Common status codes:
- `200`: Success
- `400`: Bad request (validation errors)
- `404`: Resource not found
- `500`: Server error

## Integration with Existing Middleware

### Compatible Middleware
- `validateCartQuantity`: Validates quantity format
- `validateCartTotals`: Server-side total calculation
- `validateOrderTotals`: Order validation with discounts/taxes
- `authenticateOptional`: Supports both auth and guest users

### Example with Checkout Flow
```javascript
router.post('/checkout',
  authenticateOptional,
  validateCartTotals,
  validateOrderTotals,
  checkoutController.createOrder
);
```

## Best Practices

1. **Always validate cart before checkout**: Use `validateCart` endpoint
2. **Store session_id persistently**: Use localStorage or cookies
3. **Handle stock errors gracefully**: Show clear messages to users
4. **Refresh cart after operations**: Display updated totals
5. **Merge carts on login**: Implement cart migration for guest → user
6. **Clean old carts**: Schedule cleanup of abandoned guest carts

## Testing Checklist

- [ ] Guest user can create cart
- [ ] Authenticated user cart persists
- [ ] Adding existing item increases quantity
- [ ] Stock validation prevents overselling
- [ ] Prices fetched from database
- [ ] Item removal works correctly
- [ ] Clear cart empties all items
- [ ] Validation catches inactive products
- [ ] Validation catches stock issues
- [ ] Session ID generated for new guests

## Future Enhancements

Consider implementing:
- Cart expiration for guest sessions
- Cart merging on user login
- Saved carts for authenticated users
- Cart sharing functionality
- Recommended products in cart
- Bulk operations (update multiple items)
