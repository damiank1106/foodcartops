# Supabase Setup for FoodCartOps Sync

## Overview
This document provides the SQL setup for syncing Categories and Products between FoodCartOps devices via Supabase.

## Prerequisites
- A Supabase project (create one at https://supabase.com)
- Project URL and anon key

## 1. Environment Variables

Add these to your `.env` or `app.json`:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

In `app.json`:
```json
{
  "expo": {
    "extra": {
      "EXPO_PUBLIC_SUPABASE_URL": "https://your-project.supabase.co",
      "EXPO_PUBLIC_SUPABASE_ANON_KEY": "your-anon-key-here"
    }
  }
}
```

## 2. Database Tables

### ⚠️ CRITICAL: Timestamp Format Requirement

**All synced tables MUST use BIGINT for `created_at` and `updated_at` columns (milliseconds since epoch).**

The app uses JavaScript `Date.now()` which returns milliseconds, not seconds. Using INTEGER or TIMESTAMP types will cause sync failures.

**If you already created tables with INTEGER (seconds) or TIMESTAMP types:**

```sql
-- Convert existing tables to use BIGINT milliseconds
ALTER TABLE public.users ALTER COLUMN created_at TYPE BIGINT USING (created_at::BIGINT * 1000);
ALTER TABLE public.users ALTER COLUMN updated_at TYPE BIGINT USING (updated_at::BIGINT * 1000);

ALTER TABLE public.carts ALTER COLUMN created_at TYPE BIGINT USING (created_at::BIGINT * 1000);
ALTER TABLE public.carts ALTER COLUMN updated_at TYPE BIGINT USING (updated_at::BIGINT * 1000);

ALTER TABLE public.inventory_items ALTER COLUMN created_at TYPE BIGINT USING (created_at::BIGINT * 1000);
ALTER TABLE public.inventory_items ALTER COLUMN updated_at TYPE BIGINT USING (updated_at::BIGINT * 1000);

ALTER TABLE public.inventory_storage_groups ALTER COLUMN created_at TYPE BIGINT USING (created_at::BIGINT * 1000);
ALTER TABLE public.inventory_storage_groups ALTER COLUMN updated_at TYPE BIGINT USING (updated_at::BIGINT * 1000);

ALTER TABLE public.products ALTER COLUMN created_at TYPE BIGINT USING (created_at::BIGINT * 1000);
ALTER TABLE public.products ALTER COLUMN updated_at TYPE BIGINT USING (updated_at::BIGINT * 1000);

ALTER TABLE public.product_categories ALTER COLUMN created_at TYPE BIGINT USING (created_at::BIGINT * 1000);
ALTER TABLE public.product_categories ALTER COLUMN updated_at TYPE BIGINT USING (updated_at::BIGINT * 1000);
```

**After altering columns:** Reload the Supabase schema cache or restart your Supabase client to pick up the changes.

Run the following SQL in Supabase SQL Editor:

### Create product_categories table

```sql
CREATE TABLE IF NOT EXISTS public.product_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  business_id TEXT NOT NULL DEFAULT 'default_business',
  device_id TEXT,
  deleted_at TIMESTAMPTZ,
  created_at BIGINT NOT NULL,  -- milliseconds since epoch
  updated_at BIGINT NOT NULL,  -- milliseconds since epoch
  created_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_categories_business_id ON public.product_categories(business_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_updated_at_iso ON public.product_categories(updated_at_iso);
CREATE INDEX IF NOT EXISTS idx_product_categories_deleted_at ON public.product_categories(deleted_at);
```

### Create products table

```sql
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER,
  sku TEXT,
  icon_image_uri TEXT,
  category TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  business_id TEXT NOT NULL DEFAULT 'default_business',
  device_id TEXT,
  deleted_at TIMESTAMPTZ,
  created_at BIGINT NOT NULL,  -- milliseconds since epoch
  updated_at BIGINT NOT NULL,  -- milliseconds since epoch
  created_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (category_id) REFERENCES public.product_categories(id)
);

CREATE INDEX IF NOT EXISTS idx_products_business_id ON public.products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_updated_at_iso ON public.products(updated_at_iso);
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at);
```

### Create carts table

```sql
CREATE TABLE IF NOT EXISTS public.carts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT,
  business_id TEXT NOT NULL DEFAULT 'default_business',
  device_id TEXT,
  deleted_at TIMESTAMPTZ,
  created_at BIGINT NOT NULL,  -- milliseconds since epoch
  updated_at BIGINT NOT NULL,  -- milliseconds since epoch
  created_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carts_business_id ON public.carts(business_id);
CREATE INDEX IF NOT EXISTS idx_carts_updated_at_iso ON public.carts(updated_at_iso);
CREATE INDEX IF NOT EXISTS idx_carts_deleted_at ON public.carts(deleted_at);
```

### Create inventory_storage_groups table

```sql
CREATE TABLE IF NOT EXISTS public.inventory_storage_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  business_id TEXT NOT NULL DEFAULT 'default_business',
  device_id TEXT,
  deleted_at TIMESTAMPTZ,
  created_at BIGINT NOT NULL,  -- milliseconds since epoch
  updated_at BIGINT NOT NULL,  -- milliseconds since epoch
  created_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_storage_groups_business_id ON public.inventory_storage_groups(business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_storage_groups_updated_at_iso ON public.inventory_storage_groups(updated_at_iso);
CREATE INDEX IF NOT EXISTS idx_inventory_storage_groups_deleted_at ON public.inventory_storage_groups(deleted_at);
CREATE INDEX IF NOT EXISTS idx_inventory_storage_groups_normalized_name ON public.inventory_storage_groups(normalized_name) WHERE is_active = 1;
```

### Create inventory_items table

```sql
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  reorder_level_qty REAL NOT NULL DEFAULT 0,
  storage_group TEXT NOT NULL DEFAULT 'FREEZER',
  storage_group_id TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  current_qty REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  business_id TEXT NOT NULL DEFAULT 'default_business',
  device_id TEXT,
  deleted_at TIMESTAMPTZ,
  created_at BIGINT NOT NULL,  -- milliseconds since epoch
  updated_at BIGINT NOT NULL,  -- milliseconds since epoch
  created_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_business_id ON public.inventory_items(business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_storage_group_id ON public.inventory_items(storage_group_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_updated_at_iso ON public.inventory_items(updated_at_iso);
CREATE INDEX IF NOT EXISTS idx_inventory_items_deleted_at ON public.inventory_items(deleted_at);
```

## 3. Row Level Security (RLS)

### Option A: Temporary - Allow All (for demo/testing)

**⚠️ WARNING: This allows anyone with your anon key to read/write data. Only use for development/testing.**

```sql
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on product_categories"
  ON public.product_categories
  FOR ALL
  USING (business_id = 'default_business');

CREATE POLICY "Allow all operations on products"
  ON public.products
  FOR ALL
  USING (business_id = 'default_business');

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_storage_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on carts"
  ON public.carts
  FOR ALL
  USING (business_id = 'default_business');

CREATE POLICY "Allow all operations on inventory_storage_groups"
  ON public.inventory_storage_groups
  FOR ALL
  USING (business_id = 'default_business');

CREATE POLICY "Allow all operations on inventory_items"
  ON public.inventory_items
  FOR ALL
  USING (business_id = 'default_business');
```

### Option B: Production - Authenticated Users Only

If you plan to add Supabase Auth later:

```sql
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage product_categories"
  ON public.product_categories
  FOR ALL
  TO authenticated
  USING (business_id = 'default_business');

CREATE POLICY "Authenticated users can manage products"
  ON public.products
  FOR ALL
  TO authenticated
  USING (business_id = 'default_business');

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_storage_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage carts"
  ON public.carts
  FOR ALL
  TO authenticated
  USING (business_id = 'default_business');

CREATE POLICY "Authenticated users can manage inventory_storage_groups"
  ON public.inventory_storage_groups
  FOR ALL
  TO authenticated
  USING (business_id = 'default_business');

CREATE POLICY "Authenticated users can manage inventory_items"
  ON public.inventory_items
  FOR ALL
  TO authenticated
  USING (business_id = 'default_business');
```

## 4. Testing the Setup

1. Create a category on one device:
   ```typescript
   const categoryRepo = new ProductCategoryRepository();
   await categoryRepo.create({ name: 'Test Category' }, userId);
   ```

2. Watch the sync logs in console:
   ```
   [Sync] Starting sync...
   [Sync] Pushing 1 pending changes
   [Sync] Pushed upsert for product_categories:...
   [Sync] Sync completed successfully
   ```

3. On another device with the same Supabase credentials, the category should appear after the next sync cycle (max 30 seconds).

## 5. Monitoring Sync Status

For Developer role users:
- Go to Settings
- Check "Sync Status" section
- Shows:
  - Last sync time
  - Pending changes count
  - Last error (if any)
  - Manual sync button

## 6. How It Works

### Offline-First Flow:
1. User creates/updates/deletes a category or product
2. Change is saved to local SQLite immediately
3. Change is queued in `sync_outbox` table
4. Sync runs automatically:
   - On app start
   - When app resumes from background
   - Every 30 seconds when network is available
   - Manually via Developer settings

### Conflict Resolution:
- **Local wins**: If a row has pending changes in outbox, remote updates are skipped
- **Last-write wins**: Otherwise, the most recent `updated_at_iso` wins
- **Soft deletes**: `deleted_at` field marks deletions; `is_active=0` in local DB

## 7. Troubleshooting

### Sync not working?
1. Check environment variables are set correctly
2. Check console for `[Supabase]` and `[Sync]` logs
3. Verify RLS policies allow your operations
4. Check network connectivity
5. Try manual sync from Developer settings

### Data not appearing on other device?
1. Ensure both devices use same `business_id` (default: `default_business`)
2. Check `sync_outbox` table for pending items
3. Check Supabase dashboard for data in tables
4. Verify both devices have internet access

### Errors in console?
- `"Missing credentials"`: Environment variables not loaded
- `"No internet connection"`: Network check failed
- `"RLS policy violation"`: Check RLS policies
- `"row is locked"`: Rare race condition, will retry

## 8. Scaling Considerations

For production with multiple businesses:
1. Replace `'default_business'` with actual business IDs
2. Add proper authentication via Supabase Auth
3. Update RLS policies to filter by authenticated user's business
4. Add device registration and device-specific policies if needed

## 9. Users + PIN Reset

### Create users table

This table stores PIN-only users for the food cart operations app. PINs are stored as SHA-256 hashes only.

```sql
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  pin TEXT,  -- plain-text PIN for login
  pin_hash TEXT,  -- deprecated, kept for backward compatibility
  pin_hash_alg TEXT DEFAULT 'sha256-v1',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_system BOOLEAN NOT NULL DEFAULT false,
  business_id TEXT NOT NULL DEFAULT 'default_business',
  device_id TEXT,
  deleted_at TIMESTAMPTZ,
  created_at BIGINT NOT NULL,  -- milliseconds since epoch
  updated_at BIGINT NOT NULL,  -- milliseconds since epoch
  created_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_business_id ON public.users(business_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_updated_at_iso ON public.users(updated_at_iso);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON public.users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_is_system ON public.users(is_system) WHERE is_system = true;

-- Constraint: only one system user per role
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_system_role 
  ON public.users(role) 
  WHERE is_system = true AND deleted_at IS NULL;
```

### Insert 4 fixed system users with default PINs

**⚠️ SECURITY NOTE:** These are default PINs stored as plain text. Change them in production immediately.

**⚠️ IMPORTANT:** The app now uses plain-text PINs stored in `users.pin` (NOT `pin_hash`). Ensure all users use ONLY these 4 valid roles:
- `general_manager`
- `developer`
- `operation_manager`
- `inventory_clerk`

Old roles (`boss`, `boss2`, `worker`) are automatically normalized during sync but should be updated in Supabase.

```sql
-- System User 1: General Manager (PIN: 1234)
INSERT INTO public.users (
  id, name, role, pin, is_active, is_system, 
  business_id, created_at, updated_at, created_at_iso, updated_at_iso
) VALUES (
  'system-user-general-manager',
  'General Manager',
  'general_manager',
  '1234',
  1,
  true,
  'default_business',
  (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  pin = EXCLUDED.pin,
  is_system = true,
  is_active = 1,
  role = 'general_manager',
  deleted_at = NULL,
  updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at_iso = NOW();

-- System User 2: Developer (PIN: 2345)
INSERT INTO public.users (
  id, name, role, pin, is_active, is_system, 
  business_id, created_at, updated_at, created_at_iso, updated_at_iso
) VALUES (
  'system-user-developer',
  'Developer',
  'developer',
  '2345',
  1,
  true,
  'default_business',
  (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  pin = EXCLUDED.pin,
  is_system = true,
  is_active = 1,
  role = 'developer',
  deleted_at = NULL,
  updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at_iso = NOW();

-- System User 3: Operation Manager (PIN: 1111)
INSERT INTO public.users (
  id, name, role, pin, is_active, is_system, 
  business_id, created_at, updated_at, created_at_iso, updated_at_iso
) VALUES (
  'system-user-operation-manager',
  'Operation Manager',
  'operation_manager',
  '1111',
  1,
  true,
  'default_business',
  (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  pin = EXCLUDED.pin,
  is_system = true,
  is_active = 1,
  role = 'operation_manager',
  deleted_at = NULL,
  updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at_iso = NOW();

-- System User 4: Inventory Clerk (PIN: 2222)
INSERT INTO public.users (
  id, name, role, pin, is_active, is_system, 
  business_id, created_at, updated_at, created_at_iso, updated_at_iso
) VALUES (
  'system-user-inventory-clerk',
  'Inventory Clerk',
  'inventory_clerk',
  '2222',
  1,
  true,
  'default_business',
  (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  pin = EXCLUDED.pin,
  is_system = true,
  is_active = 1,
  role = 'inventory_clerk',
  deleted_at = NULL,
  updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at_iso = NOW();

-- Migrate any old role values to new ones
UPDATE public.users SET role = 'general_manager', updated_at_iso = NOW() WHERE role = 'boss';
UPDATE public.users SET role = 'developer', updated_at_iso = NOW() WHERE role = 'boss2';
UPDATE public.users SET role = 'operation_manager', updated_at_iso = NOW() WHERE role = 'worker';
```

### Create pin_reset_requests table

Used for secure PIN reset flow (future edge function implementation).

```sql
CREATE TABLE IF NOT EXISTS public.pin_reset_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  token TEXT NOT NULL,
  device_id TEXT NOT NULL,
  used_at_iso TIMESTAMPTZ,
  created_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at_iso TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_pin_reset_requests_token ON public.pin_reset_requests(token);
CREATE INDEX IF NOT EXISTS idx_pin_reset_requests_role ON public.pin_reset_requests(role);
CREATE INDEX IF NOT EXISTS idx_pin_reset_requests_expires_at_iso ON public.pin_reset_requests(expires_at_iso);
```

### Enable RLS for users and pin_reset_requests

**⚠️ WARNING:** These permissive policies allow any client with the anon key to read/write. Only use for family/internal apps.

```sql
-- Users table RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on users"
  ON public.users
  FOR ALL
  USING (business_id = 'default_business');

-- PIN reset requests RLS
ALTER TABLE public.pin_reset_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow insert on pin_reset_requests"
  ON public.pin_reset_requests
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow select on pin_reset_requests for token lookup"
  ON public.pin_reset_requests
  FOR SELECT
  USING (true);
```

**Production Note:** For production, restrict policies to authenticated users and add business-level isolation.

### Create expenses table

```sql
CREATE TABLE IF NOT EXISTS public.expenses (
  id TEXT PRIMARY KEY,
  shift_id TEXT,
  cart_id TEXT NOT NULL,
  submitted_by_user_id TEXT NOT NULL,
  approved_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_from TEXT NOT NULL,
  notes TEXT,
  receipt_image_uri TEXT,
  reviewed_at BIGINT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  business_id TEXT NOT NULL DEFAULT 'default_business',
  device_id TEXT,
  deleted_at TIMESTAMPTZ,
  created_at BIGINT NOT NULL,  -- milliseconds since epoch
  updated_at BIGINT NOT NULL,  -- milliseconds since epoch
  created_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_business_id ON public.expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_shift_id ON public.expenses(shift_id);
CREATE INDEX IF NOT EXISTS idx_expenses_cart_id ON public.expenses(cart_id);
CREATE INDEX IF NOT EXISTS idx_expenses_submitted_by ON public.expenses(submitted_by_user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_updated_at_iso ON public.expenses(updated_at_iso);
CREATE INDEX IF NOT EXISTS idx_expenses_deleted_at ON public.expenses(deleted_at);
```

### Enable RLS for expenses

```sql
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on expenses"
  ON public.expenses
  FOR ALL
  USING (business_id = 'default_business');
```

## 10. Current Synced Tables

- `product_categories` - Product categories
- `products` - Products
- `carts` - Food carts
- `inventory_storage_groups` - Inventory storage groups (Freezer, Cart, Packaging Supply, Condiments, etc.)
- `inventory_items` - Inventory items with quantities and prices
- `users` - PIN-only users with roles (stored as SHA-256 hashes)
- `expenses` - Shift and cart expenses with approval workflow

## 11. Valid User Roles

The app now uses these 4 standardized roles only:

| Role Value | Display Name | Default PIN | User ID |
|------------|--------------|-------------|----------|
| `general_manager` | General Manager | 1234 | system-user-general-manager |
| `developer` | Developer | 2345 | system-user-developer |
| `operation_manager` | Operation Manager | 1111 | system-user-operation-manager |
| `inventory_clerk` | Inventory Clerk | 2222 | system-user-inventory-clerk |

**⚠️ IMPORTANT:** PINs are now stored as plain text in the `pin` column for simplicity.

**PRODUCTION:** Change these default PINs immediately after setup using the app's user management feature (General Manager or Developer only).

### Legacy Role Migration

If you have users with old role values in Supabase, they will be automatically normalized during sync:
- `boss` → `general_manager`
- `boss2` → `developer`
- `worker` → `operation_manager`

However, it's recommended to update Supabase directly using the UPDATE statements provided in section 9.

## 12. Future Enhancements

- Sync more tables (users, sales, shifts, expenses, etc.)
- Real-time sync using Supabase Realtime
- Conflict resolution UI
- Selective sync (choose what to sync)
- Sync analytics and monitoring dashboard
