# New API Endpoints Documentation

This document describes the newly implemented features and their API endpoints.

## Table of Contents
1. [Email Verification](#email-verification)
2. [Product Reviews & Ratings](#product-reviews--ratings)
3. [Newsletter Subscription](#newsletter-subscription)
4. [Product Search](#product-search)
5. [Inventory Management](#inventory-management)

---

## Email Verification

### POST /api/auth/verify-email
Verify email address using token sent via email.

**Auth**: None required

**Body**:
```json
{
  "token": "verification-token-from-email"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

### POST /api/auth/resend-verification
Resend verification email.

**Auth**: None required

**Body**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "If the email exists and is not verified, a new verification link will be sent"
}
```

---

## Product Reviews & Ratings

### POST /api/reviews
Submit a product review (authenticated customers only).

**Auth**: Customer JWT required

**Body**:
```json
{
  "product_id": "uuid",
  "rating": 5,
  "title": "Excellent product!",
  "review_text": "This is an amazing product. Highly recommended!",
  "order_id": "uuid" // Optional, for verified purchase
}
```

**Response**:
```json
{
  "success": true,
  "message": "Review submitted successfully. It will be visible after admin approval.",
  "data": {
    "id": "uuid",
    "product_id": "uuid",
    "user_id": "uuid",
    "rating": 5,
    "title": "Excellent product!",
    "review_text": "This is an amazing product...",
    "is_verified_purchase": true,
    "is_approved": false,
    "helpful_count": 0,
    "created_at": "2026-02-17T..."
  }
}
```

### GET /api/reviews/product/:productId
Get all approved reviews for a product (public).

**Auth**: None required

**Query Parameters**:
- `page` (default: 1)
- `limit` (default: 10)
- `sort` (options: recent, helpful, rating_high, rating_low)

**Response**:
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "rating": 5,
        "title": "Great product",
        "review_text": "Loved it!",
        "is_verified_purchase": true,
        "helpful_count": 12,
        "created_at": "2026-02-17T...",
        "reviewer_name": "John Doe"
      }
    ],
    "summary": {
      "averageRating": 4.5,
      "totalReviews": 125,
      "ratingBreakdown": {
        "5": 80,
        "4": 30,
        "3": 10,
        "2": 3,
        "1": 2
      }
    },
    "pagination": {
      "currentPage": 1,
      "totalPages": 13,
      "totalReviews": 125,
      "limit": 10
    }
  }
}
```

### PUT /api/reviews/:id
Update your own review.

**Auth**: Customer JWT required

**Body**:
```json
{
  "rating": 4,
  "title": "Updated title",
  "review_text": "Updated review text"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Review updated successfully. It will be reviewed again before being published.",
  "data": {
    "id": "uuid",
    "rating": 4,
    "title": "Updated title",
    "review_text": "Updated review text",
    "is_approved": false,
    "updated_at": "2026-02-17T..."
  }
}
```

### DELETE /api/reviews/:id
Delete your own review.

**Auth**: Customer JWT required

**Response**:
```json
{
  "success": true,
  "message": "Review deleted successfully"
}
```

### POST /api/reviews/:id/helpful
Mark a review as helpful (public).

**Auth**: None required

**Response**:
```json
{
  "success": true,
  "message": "Thank you for your feedback",
  "data": {
    "helpful_count": 13
  }
}
```

### GET /api/reviews/admin/all
Get all reviews for moderation (admin only).

**Auth**: Admin JWT required

**Query Parameters**:
- `page` (default: 1)
- `limit` (default: 20)
- `status` (options: all, pending, approved)

**Response**:
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "rating": 5,
        "title": "Great",
        "review_text": "Excellent product",
        "is_verified_purchase": true,
        "is_approved": false,
        "helpful_count": 0,
        "created_at": "2026-02-17T...",
        "reviewer_name": "John Doe",
        "reviewer_email": "john@example.com",
        "product_name": "Premium Wig",
        "product_id": "uuid"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalReviews": 95,
      "limit": 20
    }
  }
}
```

### PUT /api/reviews/admin/:id/approve
Approve a review (admin only).

**Auth**: Admin JWT required

**Response**:
```json
{
  "success": true,
  "message": "Review approved successfully",
  "data": {
    "id": "uuid",
    "is_approved": true
  }
}
```

### PUT /api/reviews/admin/:id/reject
Reject and delete a review (admin only).

**Auth**: Admin JWT required

**Response**:
```json
{
  "success": true,
  "message": "Review rejected and deleted successfully"
}
```

---

## Newsletter Subscription

### POST /api/newsletter/subscribe
Subscribe to newsletter (public).

**Auth**: None required

**Body**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Please check your email to confirm your subscription"
}
```

### GET /api/newsletter/verify/:token
Verify newsletter subscription.

**Auth**: None required

**Response**:
```json
{
  "success": true,
  "message": "Email verified successfully! You are now subscribed to our newsletter."
}
```

### POST /api/newsletter/unsubscribe
Unsubscribe from newsletter.

**Auth**: None required

**Body**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Successfully unsubscribed from newsletter"
}
```

### GET /api/newsletter/admin/subscribers
Get all newsletter subscribers (admin only).

**Auth**: Admin JWT required

**Query Parameters**:
- `page` (default: 1)
- `limit` (default: 50)
- `status` (options: active, pending, unsubscribed, all)

**Response**:
```json
{
  "success": true,
  "data": {
    "subscribers": [
      {
        "id": "uuid",
        "email": "user@example.com",
        "is_verified": true,
        "subscribed_at": "2026-02-17T...",
        "unsubscribed_at": null
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 10,
      "totalSubscribers": 487,
      "limit": 50
    }
  }
}
```

### GET /api/newsletter/admin/export
Export subscribers as CSV (admin only).

**Auth**: Admin JWT required

**Query Parameters**:
- `status` (options: active, pending, unsubscribed, all)

**Response**: CSV file download

---

## Product Search

### GET /api/products/search
Search products using full-text search (public).

**Auth**: None required

**Query Parameters**:
- `q` (required) - search query
- `category_id` (optional)
- `price_min` (optional)
- `price_max` (optional)
- `page` (default: 1)
- `limit` (default: 20)

**Example**: `GET /api/products/search?q=premium+hair&price_min=100&page=1`

**Response**:
```json
{
  "success": true,
  "data": {
    "query": "premium hair",
    "products": [
      {
        "id": "uuid",
        "name": "Premium Hair Wig",
        "description": "...",
        "category_name": "Wigs",
        "base_price": 199.99,
        "stock_quantity": 50,
        "average_rating": 4.5,
        "review_count": 23,
        "rank": 0.567 // Search relevance score
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalProducts": 87,
      "limit": 20
    }
  }
}
```

---

## Inventory Management

### GET /api/admin/inventory/stats
Get inventory statistics (admin only).

**Auth**: Admin JWT required

**Response**:
```json
{
  "success": true,
  "data": {
    "totalProducts": 250,
    "outOfStock": 15,
    "lowStock": 42,
    "inStock": 193,
    "totalUnits": 5420,
    "avgStockPerProduct": 21.68
  }
}
```

### POST /api/admin/inventory/check-alerts
Check for low stock and send alerts (admin only).

**Auth**: Admin JWT required

**Response**:
```json
{
  "success": true,
  "message": "Found 42 low stock products. Alerts sent to 3 admins.",
  "data": {
    "count": 42,
    "products": [
      {
        "id": "uuid",
        "name": "Premium Wig",
        "sku": "WIG-001",
        "stock_quantity": 5,
        "low_stock_threshold": 10
      }
    ],
    "alertsSentTo": 3
  }
}
```

### PUT /api/admin/inventory/:productId/threshold
Update low stock threshold for a product (admin only).

**Auth**: Admin JWT required

**Body**:
```json
{
  "low_stock_threshold": 15
}
```

**Response**:
```json
{
  "success": true,
  "message": "Stock threshold updated successfully",
  "data": {
    "id": "uuid",
    "name": "Premium Wig",
    "low_stock_threshold": 15
  }
}
```

---

## Updated Endpoints

### Registration Flow Update
When users register (`POST /api/auth/register`), they now receive:
- A verification token
- An email with verification link
- `emailVerified: false` in the response

### Login Flow Update
The login response (`POST /api/auth/login`) now includes:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "jwt-token",
    "user": {
      "id": "uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "emailVerified": true,  // NEW FIELD
      "createdAt": "2026-02-17T..."
    }
  }
}
```

### Order Creation Update
Creating an order (`POST /api/orders`) now:
1. Checks if user's email is verified (returns 403 if not)
2. Sends order confirmation email automatically
3. Requires email verification before allowing orders

### Product Details Update
Getting product details (`GET /api/products/:id`) now includes:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Premium Wig",
    // ... other fields ...
    "averageRating": 4.5,  // NEW FIELD
    "reviewCount": 23,     // NEW FIELD
    "variants": [...]
  }
}
```

---

## Email Configuration

Add these to your `.env` file:

```env
# Email Service Configuration
EMAIL_SERVICE=smtp  # or 'sendgrid', 'mailgun'
EMAIL_FROM=noreply@premiumhairsa.co.za
EMAIL_FROM_NAME=Premium Hair Wigs & Extensions

# SendGrid (if EMAIL_SERVICE=sendgrid)
SENDGRID_API_KEY=your_key_here

# Mailgun (if EMAIL_SERVICE=mailgun)
MAILGUN_API_KEY=your_key_here
MAILGUN_DOMAIN=your_domain_here

# SMTP (if EMAIL_SERVICE=smtp)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_SECURE=false
```

---

## Database Migration

Before using these features, run the database migration:

```bash
psql $DATABASE_URL < db/migrations/001_add_email_verification_and_reviews.sql
```

This will:
- Add email verification fields to users table
- Create product_reviews table
- Update newsletter_subscribers table
- Create email_logs table
- Add full-text search support to products table

---

## Notes

1. **Email Verification**: Users must verify their email before placing orders
2. **Reviews**: All reviews require admin approval before appearing publicly
3. **Newsletter**: Double opt-in required (email verification)
4. **Search**: Uses PostgreSQL full-text search for typo tolerance
5. **Inventory Alerts**: Can be run manually or scheduled via cron job
6. **Development Mode**: Emails are logged to console instead of being sent

---

## Testing

To test email functionality in development:
1. Leave `EMAIL_SERVICE` unset or empty in `.env`
2. Emails will be logged to console
3. Verification tokens will be included in API responses (development only)

For production:
1. Set up SendGrid, Mailgun, or SMTP credentials
2. Set `EMAIL_SERVICE` to your chosen provider
3. Configure the appropriate API keys/credentials
