# Database Migrations

This directory contains database migration scripts for the Premium Hair E-Commerce platform.

## Migration Files

Migrations are named with timestamps to ensure proper execution order:
- `001_initial_schema.sql` - Initial database schema
- `002_add_new_tables.sql` - Additional tables for comprehensive e-commerce
- `003_add_indexes.sql` - Performance optimization indexes

## Running Migrations

To run all migrations:
```bash
npm run migrate
```

To run a specific migration:
```bash
psql -U $DB_USER -d $DB_NAME -f db/migrations/001_initial_schema.sql
```

## Creating New Migrations

1. Create a new file with format: `NNN_description.sql`
2. Include both UP and DOWN migrations
3. Test migrations on development database first
4. Document any breaking changes

## Migration Status

| Migration | Status | Date |
|-----------|--------|------|
| 001_initial_schema.sql | ✅ Applied | 2024-01-01 |
| 002_add_new_tables.sql | ✅ Applied | 2024-01-02 |
| 003_add_indexes.sql | ✅ Applied | 2024-01-03 |
