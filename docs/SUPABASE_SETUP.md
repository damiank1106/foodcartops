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
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
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
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_iso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (category_id) REFERENCES public.product_categories(id)
);

CREATE INDEX IF NOT EXISTS idx_products_business_id ON public.products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_updated_at_iso ON public.products(updated_at_iso);
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at);
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

## 9. Future Enhancements

- Sync more tables (users, carts, sales, etc.)
- Real-time sync using Supabase Realtime
- Conflict resolution UI
- Selective sync (choose what to sync)
- Sync analytics and monitoring dashboard
