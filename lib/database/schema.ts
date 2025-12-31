export const SCHEMA_VERSION = 40;

export const MIGRATIONS = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('boss', 'boss2', 'worker')),
        pin TEXT,
        password_hash TEXT,
        email TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS carts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        category TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        cart_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        total_amount REAL NOT NULL,
        payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'card', 'digital')),
        notes TEXT,
        receipt_photo TEXT,
        created_at INTEGER NOT NULL,
        synced_at INTEGER,
        FOREIGN KEY (cart_id) REFERENCES carts(id),
        FOREIGN KEY (worker_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      );

      CREATE TABLE IF NOT EXISTS worker_shifts (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        cart_id TEXT NOT NULL,
        clock_in INTEGER NOT NULL,
        clock_out INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        synced_at INTEGER,
        FOREIGN KEY (worker_id) REFERENCES users(id),
        FOREIGN KEY (cart_id) REFERENCES carts(id)
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        old_data TEXT,
        new_data TEXT,
        created_at INTEGER NOT NULL,
        synced_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
        payload TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt INTEGER,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'syncing', 'failed', 'synced')),
        error TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX idx_sales_cart_id ON sales(cart_id);
      CREATE INDEX idx_sales_worker_id ON sales(worker_id);
      CREATE INDEX idx_sales_created_at ON sales(created_at);
      CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);
      CREATE INDEX idx_worker_shifts_worker_id ON worker_shifts(worker_id);
      CREATE INDEX idx_worker_shifts_cart_id ON worker_shifts(cart_id);
      CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
      CREATE INDEX idx_sync_queue_status ON sync_queue(status);
    `,
    down: `
      DROP TABLE IF EXISTS sync_queue;
      DROP TABLE IF EXISTS audit_logs;
      DROP TABLE IF EXISTS worker_shifts;
      DROP TABLE IF EXISTS sale_items;
      DROP TABLE IF EXISTS sales;
      DROP TABLE IF EXISTS products;
      DROP TABLE IF EXISTS carts;
      DROP TABLE IF EXISTS users;
    `,
  },
  {
    version: 2,
    up: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
    down: `
      DROP TABLE IF EXISTS app_settings;
    `,
  },
  {
    version: 3,
    up: `
      ALTER TABLE worker_shifts ADD COLUMN starting_cash_cents INTEGER DEFAULT 0;
      ALTER TABLE worker_shifts ADD COLUMN expected_cash_cents INTEGER DEFAULT 0;
      ALTER TABLE worker_shifts ADD COLUMN notes TEXT;
      ALTER TABLE worker_shifts ADD COLUMN status TEXT DEFAULT 'active' CHECK(status IN ('assigned', 'active', 'ended'));

      CREATE TABLE IF NOT EXISTS shift_events (
        id TEXT PRIMARY KEY,
        shift_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (shift_id) REFERENCES worker_shifts(id)
      );

      CREATE INDEX idx_shift_events_shift_id ON shift_events(shift_id);
      CREATE INDEX idx_shift_events_created_at ON shift_events(created_at);
    `,
    down: `
      DROP TABLE IF EXISTS shift_events;
      ALTER TABLE worker_shifts DROP COLUMN starting_cash_cents;
      ALTER TABLE worker_shifts DROP COLUMN expected_cash_cents;
      ALTER TABLE worker_shifts DROP COLUMN notes;
      ALTER TABLE worker_shifts DROP COLUMN status;
    `,
  },
  {
    version: 4,
    up: `
      CREATE TABLE sales_new (
        id TEXT PRIMARY KEY,
        cart_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        shift_id TEXT,
        total_amount REAL NOT NULL,
        subtotal_cents INTEGER NOT NULL DEFAULT 0,
        discount_cents INTEGER NOT NULL DEFAULT 0,
        total_cents INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        receipt_photo TEXT,
        voided_at INTEGER,
        voided_by TEXT,
        edited_at INTEGER,
        created_at INTEGER NOT NULL,
        synced_at INTEGER,
        FOREIGN KEY (cart_id) REFERENCES carts(id),
        FOREIGN KEY (worker_id) REFERENCES users(id)
      );

      INSERT INTO sales_new (id, cart_id, worker_id, total_amount, notes, receipt_photo, created_at, synced_at)
      SELECT id, cart_id, worker_id, total_amount, notes, receipt_photo, created_at, synced_at FROM sales;

      UPDATE sales_new SET 
        subtotal_cents = CAST(total_amount * 100 AS INTEGER),
        total_cents = CAST(total_amount * 100 AS INTEGER);

      DROP TABLE sales;
      ALTER TABLE sales_new RENAME TO sales;

      CREATE INDEX idx_sales_cart_id ON sales(cart_id);
      CREATE INDEX idx_sales_worker_id ON sales(worker_id);
      CREATE INDEX idx_sales_created_at ON sales(created_at);
      CREATE INDEX idx_sales_shift_id ON sales(shift_id);

      CREATE TABLE sale_items_new (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        unit_price_cents INTEGER NOT NULL DEFAULT 0,
        line_total_cents INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      );

      INSERT INTO sale_items_new (id, sale_id, product_id, quantity, unit_price, total_price, created_at)
      SELECT id, sale_id, product_id, quantity, unit_price, total_price, created_at FROM sale_items;

      UPDATE sale_items_new SET 
        unit_price_cents = CAST(unit_price * 100 AS INTEGER),
        line_total_cents = CAST(total_price * 100 AS INTEGER);

      DROP TABLE sale_items;
      ALTER TABLE sale_items_new RENAME TO sale_items;

      CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);

      ALTER TABLE products ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0;
      UPDATE products SET price_cents = CAST(price * 100 AS INTEGER);

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        method TEXT NOT NULL CHECK(method IN ('CASH', 'GCASH', 'CARD', 'OTHER')),
        amount_cents INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id)
      );

      CREATE INDEX idx_payments_sale_id ON payments(sale_id);
    `,
    down: `
      DROP TABLE IF EXISTS payments;
      ALTER TABLE sales DROP COLUMN shift_id;
      ALTER TABLE sales DROP COLUMN subtotal_cents;
      ALTER TABLE sales DROP COLUMN discount_cents;
      ALTER TABLE sales DROP COLUMN total_cents;
      ALTER TABLE sales DROP COLUMN voided_at;
      ALTER TABLE sales DROP COLUMN voided_by;
      ALTER TABLE sales DROP COLUMN edited_at;
      ALTER TABLE sale_items DROP COLUMN unit_price_cents;
      ALTER TABLE sale_items DROP COLUMN line_total_cents;
      ALTER TABLE products DROP COLUMN price_cents;
    `,
  },
  {
    version: 5,
    up: `
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        shift_id TEXT NOT NULL,
        cart_id TEXT NOT NULL,
        submitted_by_user_id TEXT NOT NULL,
        approved_by_user_id TEXT,
        status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
        category TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        paid_from TEXT NOT NULL CHECK(paid_from IN ('CASH_DRAWER', 'PERSONAL', 'COMPANY')),
        notes TEXT,
        receipt_image_uri TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        reviewed_at INTEGER,
        FOREIGN KEY (shift_id) REFERENCES worker_shifts(id),
        FOREIGN KEY (cart_id) REFERENCES carts(id),
        FOREIGN KEY (submitted_by_user_id) REFERENCES users(id),
        FOREIGN KEY (approved_by_user_id) REFERENCES users(id)
      );

      CREATE INDEX idx_expenses_shift_id ON expenses(shift_id);
      CREATE INDEX idx_expenses_status ON expenses(status);
      CREATE INDEX idx_expenses_submitted_by ON expenses(submitted_by_user_id);
      CREATE INDEX idx_expenses_created_at ON expenses(created_at);
    `,
    down: `
      DROP TABLE IF EXISTS expenses;
    `,
  },
  {
    version: 6,
    up: `
      ALTER TABLE users ADD COLUMN role_new TEXT;
      UPDATE users SET role_new = role;
      
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('boss', 'boss2', 'worker')),
        pin TEXT,
        password_hash TEXT,
        email TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      INSERT INTO users_new SELECT id, name, role_new, pin, password_hash, email, created_at, updated_at, is_active FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;

      CREATE TABLE IF NOT EXISTS user_cart_assignments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        cart_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (cart_id) REFERENCES carts(id),
        UNIQUE(user_id, cart_id)
      );

      CREATE INDEX idx_user_cart_assignments_user_id ON user_cart_assignments(user_id);
      CREATE INDEX idx_user_cart_assignments_cart_id ON user_cart_assignments(cart_id);

      CREATE TABLE IF NOT EXISTS settlements (
        id TEXT PRIMARY KEY,
        shift_id TEXT NOT NULL,
        cart_id TEXT NOT NULL,
        worker_user_id TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL,
        finalized_by_user_id TEXT,
        computed_json TEXT,
        cash_expected_cents INTEGER NOT NULL DEFAULT 0,
        cash_counted_cents INTEGER NOT NULL DEFAULT 0,
        cash_difference_cents INTEGER NOT NULL DEFAULT 0,
        net_due_to_worker_cents INTEGER NOT NULL DEFAULT 0,
        net_due_to_boss_cents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'FINALIZED')),
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        finalized_at INTEGER,
        FOREIGN KEY (shift_id) REFERENCES worker_shifts(id),
        FOREIGN KEY (cart_id) REFERENCES carts(id),
        FOREIGN KEY (worker_user_id) REFERENCES users(id),
        FOREIGN KEY (created_by_user_id) REFERENCES users(id),
        FOREIGN KEY (finalized_by_user_id) REFERENCES users(id)
      );

      CREATE INDEX idx_settlements_shift_id ON settlements(shift_id);
      CREATE INDEX idx_settlements_status ON settlements(status);
      CREATE INDEX idx_settlements_cart_id ON settlements(cart_id);
      CREATE INDEX idx_settlements_worker_id ON settlements(worker_user_id);

      CREATE TABLE IF NOT EXISTS payroll_rules (
        id TEXT PRIMARY KEY,
        worker_user_id TEXT NOT NULL,
        base_daily_cents INTEGER NOT NULL DEFAULT 0,
        commission_type TEXT NOT NULL DEFAULT 'NONE' CHECK(commission_type IN ('NONE', 'PERCENT_OF_SALES', 'PERCENT_OF_PROFIT')),
        commission_rate_bps INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (worker_user_id) REFERENCES users(id)
      );

      CREATE INDEX idx_payroll_rules_worker_id ON payroll_rules(worker_user_id);
      CREATE INDEX idx_payroll_rules_is_active ON payroll_rules(is_active);

      CREATE TABLE IF NOT EXISTS worker_ledger (
        id TEXT PRIMARY KEY,
        worker_user_id TEXT NOT NULL,
        shift_id TEXT,
        type TEXT NOT NULL CHECK(type IN ('WAGE', 'COMMISSION', 'ADVANCE', 'DEDUCTION', 'BONUS', 'ADJUSTMENT')),
        amount_cents INTEGER NOT NULL,
        notes TEXT,
        created_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (worker_user_id) REFERENCES users(id),
        FOREIGN KEY (shift_id) REFERENCES worker_shifts(id),
        FOREIGN KEY (created_by_user_id) REFERENCES users(id)
      );

      CREATE INDEX idx_worker_ledger_worker_id ON worker_ledger(worker_user_id);
      CREATE INDEX idx_worker_ledger_shift_id ON worker_ledger(shift_id);
      CREATE INDEX idx_worker_ledger_type ON worker_ledger(type);
    `,
    down: `
      DROP TABLE IF EXISTS worker_ledger;
      DROP TABLE IF EXISTS payroll_rules;
      DROP TABLE IF EXISTS settlements;
      DROP TABLE IF EXISTS user_cart_assignments;
    `,
  },
  {
    version: 7,
    up: `
      ALTER TABLE settlements ADD COLUMN settlement_day TEXT;
      ALTER TABLE settlements ADD COLUMN daily_net_sales_cents INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE settlements ADD COLUMN manager_share_cents INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE settlements ADD COLUMN owner_share_cents INTEGER NOT NULL DEFAULT 0;

      INSERT OR IGNORE INTO app_settings (key, value_json, updated_at)
      VALUES (
        'net_sales_split_bps',
        '{"manager_bps": 7000, "owner_bps": 3000}',
        ${Date.now()}
      );
    `,
    down: `
      ALTER TABLE settlements DROP COLUMN settlement_day;
      ALTER TABLE settlements DROP COLUMN daily_net_sales_cents;
      ALTER TABLE settlements DROP COLUMN manager_share_cents;
      ALTER TABLE settlements DROP COLUMN owner_share_cents;
    `,
  },
  {
    version: 8,
    up: `
      CREATE TABLE IF NOT EXISTS boss_saved_items (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('EXCEPTION', 'ALERT', 'DRAFT', 'SETTLEMENT')),
        title TEXT NOT NULL,
        notes TEXT,
        severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH')),
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'RESOLVED')),
        linked_entity_type TEXT,
        linked_entity_id TEXT,
        created_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id)
      );

      CREATE INDEX idx_boss_saved_items_status ON boss_saved_items(status);
      CREATE INDEX idx_boss_saved_items_type ON boss_saved_items(type);
      CREATE INDEX idx_boss_saved_items_created_by ON boss_saved_items(created_by_user_id);
      CREATE INDEX idx_boss_saved_items_linked ON boss_saved_items(linked_entity_type, linked_entity_id);
    `,
    down: `
      DROP TABLE IF EXISTS boss_saved_items;
    `,
  },
  {
    version: 9,
    up: `
      CREATE TABLE expenses_new (
        id TEXT PRIMARY KEY,
        shift_id TEXT,
        cart_id TEXT NOT NULL,
        submitted_by_user_id TEXT NOT NULL,
        approved_by_user_id TEXT,
        status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'DRAFT')),
        category TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        paid_from TEXT NOT NULL CHECK(paid_from IN ('CASH_DRAWER', 'PERSONAL', 'COMPANY')),
        notes TEXT,
        receipt_image_uri TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        reviewed_at INTEGER,
        FOREIGN KEY (shift_id) REFERENCES worker_shifts(id),
        FOREIGN KEY (cart_id) REFERENCES carts(id),
        FOREIGN KEY (submitted_by_user_id) REFERENCES users(id),
        FOREIGN KEY (approved_by_user_id) REFERENCES users(id)
      );

      INSERT INTO expenses_new SELECT * FROM expenses;
      DROP TABLE expenses;
      ALTER TABLE expenses_new RENAME TO expenses;

      CREATE INDEX idx_expenses_shift_id ON expenses(shift_id);
      CREATE INDEX idx_expenses_status ON expenses(status);
      CREATE INDEX idx_expenses_submitted_by ON expenses(submitted_by_user_id);
      CREATE INDEX idx_expenses_created_at ON expenses(created_at);
    `,
    down: `
      DROP TABLE expenses;
    `,
  },
  {
    version: 10,
    up: `
      ALTER TABLE audit_logs ADD COLUMN deleted_at INTEGER;
      CREATE INDEX idx_audit_logs_deleted_at ON audit_logs(deleted_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_audit_logs_deleted_at;
      ALTER TABLE audit_logs DROP COLUMN deleted_at;
    `,
  },
  {
    version: 11,
    up: `
      UPDATE users SET role = 'worker' WHERE role = 'manager';
    `,
    down: `
    `,
  },
  {
    version: 12,
    up: `
      ALTER TABLE carts ADD COLUMN notes TEXT;
    `,
    down: `
      ALTER TABLE carts DROP COLUMN notes;
    `,
  },
  {
    version: 13,
    up: `
      CREATE TABLE IF NOT EXISTS product_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX idx_product_categories_sort_order ON product_categories(sort_order);
      CREATE INDEX idx_product_categories_is_active ON product_categories(is_active);

      CREATE TABLE products_new (
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
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (category_id) REFERENCES product_categories(id)
      );

      INSERT INTO products_new (id, name, price, price_cents, category, is_active, created_at, updated_at)
      SELECT id, name, price, price_cents, category, is_active, created_at, updated_at FROM products;

      DROP TABLE products;
      ALTER TABLE products_new RENAME TO products;

      CREATE INDEX idx_products_category_id ON products(category_id);
      CREATE INDEX idx_products_is_active ON products(is_active);
    `,
    down: `
      DROP TABLE IF EXISTS product_categories;
      DROP INDEX IF EXISTS idx_products_category_id;
    `,
  },
  {
    version: 14,
    up: `
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('boss', 'boss2', 'worker', 'inventory_clerk')),
        pin TEXT,
        password_hash TEXT,
        email TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      INSERT INTO users_new SELECT * FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `,
    down: `
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('boss', 'boss2', 'worker')),
        pin TEXT,
        password_hash TEXT,
        email TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      INSERT INTO users_new SELECT * FROM users WHERE role IN ('boss', 'boss2', 'worker');
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `,
  },
  {
    version: 15,
    up: `
      CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL CHECK(unit IN ('pcs', 'kg', 'g', 'L', 'mL')),
        reorder_level_qty REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX idx_inventory_items_is_active ON inventory_items(is_active);
      CREATE INDEX idx_inventory_items_name ON inventory_items(name);

      CREATE TABLE IF NOT EXISTS stock_locations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('WAREHOUSE', 'CART')),
        cart_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (cart_id) REFERENCES carts(id)
      );

      CREATE INDEX idx_stock_locations_type ON stock_locations(type);
      CREATE INDEX idx_stock_locations_cart_id ON stock_locations(cart_id);
      CREATE INDEX idx_stock_locations_is_active ON stock_locations(is_active);

      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        inventory_item_id TEXT NOT NULL,
        from_location_id TEXT,
        to_location_id TEXT,
        qty REAL NOT NULL,
        reason TEXT NOT NULL CHECK(reason IN ('PURCHASE', 'ISSUE_TO_CART', 'RETURN_TO_WAREHOUSE', 'WASTE', 'ADJUSTMENT', 'TRANSFER')),
        cost_cents INTEGER,
        shift_id TEXT,
        actor_user_id TEXT NOT NULL,
        notes TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
        FOREIGN KEY (from_location_id) REFERENCES stock_locations(id),
        FOREIGN KEY (to_location_id) REFERENCES stock_locations(id),
        FOREIGN KEY (shift_id) REFERENCES worker_shifts(id),
        FOREIGN KEY (actor_user_id) REFERENCES users(id)
      );

      CREATE INDEX idx_stock_movements_inventory_item_id ON stock_movements(inventory_item_id);
      CREATE INDEX idx_stock_movements_from_location_id ON stock_movements(from_location_id);
      CREATE INDEX idx_stock_movements_to_location_id ON stock_movements(to_location_id);
      CREATE INDEX idx_stock_movements_reason ON stock_movements(reason);
      CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at);
      CREATE INDEX idx_stock_movements_actor_user_id ON stock_movements(actor_user_id);

      CREATE TABLE IF NOT EXISTS stock_balances_cache (
        inventory_item_id TEXT NOT NULL,
        stock_location_id TEXT NOT NULL,
        qty REAL NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (inventory_item_id, stock_location_id),
        FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
        FOREIGN KEY (stock_location_id) REFERENCES stock_locations(id)
      );

      CREATE INDEX idx_stock_balances_cache_stock_location_id ON stock_balances_cache(stock_location_id);
      CREATE INDEX idx_stock_balances_cache_inventory_item_id ON stock_balances_cache(inventory_item_id);
    `,
    down: `
      DROP TABLE IF EXISTS stock_balances_cache;
      DROP TABLE IF EXISTS stock_movements;
      DROP TABLE IF EXISTS stock_locations;
      DROP TABLE IF EXISTS inventory_items;
    `,
  },
  {
    version: 16,
    up: `
      ALTER TABLE products ADD COLUMN inventory_item_id TEXT;
      ALTER TABLE products ADD COLUMN units_per_sale REAL NOT NULL DEFAULT 1;

      CREATE INDEX idx_products_inventory_item_id ON products(inventory_item_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_products_inventory_item_id;
      ALTER TABLE products DROP COLUMN units_per_sale;
      ALTER TABLE products DROP COLUMN inventory_item_id;
    `,
  },
  {
    version: 17,
    up: `
      ALTER TABLE inventory_items ADD COLUMN storage_group TEXT NOT NULL DEFAULT 'FREEZER' CHECK(storage_group IN ('FREEZER', 'CART'));
      
      DROP TABLE IF EXISTS stock_balances_cache;
      DROP TABLE IF EXISTS stock_movements;
      DROP TABLE IF EXISTS stock_locations;

      CREATE TABLE products_temp (
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
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (category_id) REFERENCES product_categories(id)
      );

      INSERT INTO products_temp (id, category_id, name, description, price, price_cents, cost_cents, sku, icon_image_uri, category, is_active, created_at, updated_at)
      SELECT id, category_id, name, description, price, price_cents, cost_cents, sku, icon_image_uri, category, is_active, created_at, updated_at FROM products;

      DROP TABLE products;
      ALTER TABLE products_temp RENAME TO products;

      CREATE INDEX idx_products_category_id ON products(category_id);
      CREATE INDEX idx_products_is_active ON products(is_active);
    `,
    down: `
      ALTER TABLE inventory_items DROP COLUMN storage_group;
    `,
  },
  {
    version: 18,
    up: `
      CREATE TABLE IF NOT EXISTS saved_records (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('expense', 'settlement')),
        source_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id)
      );

      CREATE INDEX idx_saved_records_type ON saved_records(type);
      CREATE INDEX idx_saved_records_source_id ON saved_records(source_id);
      CREATE INDEX idx_saved_records_is_deleted ON saved_records(is_deleted);
      CREATE INDEX idx_saved_records_created_by ON saved_records(created_by_user_id);
    `,
    down: `
      DROP TABLE IF EXISTS saved_records;
    `,
  },
  {
    version: 19,
    up: `
      ALTER TABLE carts ADD COLUMN created_by_user_id TEXT;

      ALTER TABLE expenses ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX idx_expenses_is_deleted ON expenses(is_deleted);
    `,
    down: `
      ALTER TABLE carts DROP COLUMN created_by_user_id;
      DROP INDEX IF EXISTS idx_expenses_is_deleted;
      ALTER TABLE expenses DROP COLUMN is_deleted;
    `,
  },
  {
    version: 20,
    up: `
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('boss', 'boss2', 'worker', 'inventory_clerk', 'developer')),
        pin TEXT,
        password_hash TEXT,
        email TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      INSERT INTO users_new SELECT * FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;

      CREATE TABLE IF NOT EXISTS db_change_log (
        id TEXT PRIMARY KEY,
        message TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX idx_db_change_log_is_deleted ON db_change_log(is_deleted);
      CREATE INDEX idx_db_change_log_created_at ON db_change_log(created_at);

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Added developer role to users table', ${Date.now()}),
      (lower(hex(randomblob(16))), 'Created db_change_log table for tracking schema changes', ${Date.now()});
    `,
    down: `
      DROP TABLE IF EXISTS db_change_log;
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('boss', 'boss2', 'worker', 'inventory_clerk')),
        pin TEXT,
        password_hash TEXT,
        email TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      INSERT INTO users_new SELECT * FROM users WHERE role IN ('boss', 'boss2', 'worker', 'inventory_clerk');
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `,
  },
  {
    version: 21,
    up: `
      CREATE TABLE IF NOT EXISTS other_expenses (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        name TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        notes TEXT,
        created_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id)
      );

      CREATE INDEX idx_other_expenses_date ON other_expenses(date);
      CREATE INDEX idx_other_expenses_is_deleted ON other_expenses(is_deleted);
      CREATE INDEX idx_other_expenses_created_by ON other_expenses(created_by_user_id);

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Created other_expenses table for calendar analytics', ${Date.now()});
    `,
    down: `
      DROP TABLE IF EXISTS other_expenses;
    `,
  },
  {
    version: 22,
    up: `
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY,
        dark_mode INTEGER NOT NULL DEFAULT 1,
        light_bg_color TEXT,
        light_bg_intensity TEXT NOT NULL DEFAULT 'medium' CHECK(light_bg_intensity IN ('light', 'medium', 'high')),
        food_icons_enabled INTEGER NOT NULL DEFAULT 0,
        food_icons_intensity TEXT NOT NULL DEFAULT 'medium' CHECK(food_icons_intensity IN ('light', 'medium', 'high')),
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

      ALTER TABLE users ADD COLUMN profile_image_uri TEXT;

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Created user_preferences table for inventory settings', ${Date.now()}),
      (lower(hex(randomblob(16))), 'Added profile_image_uri to users table', ${Date.now()});
    `,
    down: `
      DROP TABLE IF EXISTS user_preferences;
      ALTER TABLE users DROP COLUMN profile_image_uri;
    `,
  },
  {
    version: 23,
    up: `
      ALTER TABLE product_categories ADD COLUMN business_id TEXT NOT NULL DEFAULT 'default_business';
      ALTER TABLE product_categories ADD COLUMN device_id TEXT;
      ALTER TABLE product_categories ADD COLUMN deleted_at TEXT;
      ALTER TABLE product_categories ADD COLUMN created_at_iso TEXT;
      ALTER TABLE product_categories ADD COLUMN updated_at_iso TEXT;

      ALTER TABLE products ADD COLUMN business_id TEXT NOT NULL DEFAULT 'default_business';
      ALTER TABLE products ADD COLUMN device_id TEXT;
      ALTER TABLE products ADD COLUMN deleted_at TEXT;
      ALTER TABLE products ADD COLUMN created_at_iso TEXT;
      ALTER TABLE products ADD COLUMN updated_at_iso TEXT;

      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL CHECK(table_name IN ('product_categories', 'products')),
        row_id TEXT NOT NULL,
        op TEXT NOT NULL CHECK(op IN ('upsert', 'delete')),
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );

      CREATE INDEX idx_sync_outbox_table_name ON sync_outbox(table_name);
      CREATE INDEX idx_sync_outbox_created_at ON sync_outbox(created_at);

      CREATE TABLE IF NOT EXISTS sync_state (
        table_name TEXT PRIMARY KEY,
        last_sync_at TEXT
      );

      INSERT OR IGNORE INTO sync_state (table_name) VALUES ('product_categories');
      INSERT OR IGNORE INTO sync_state (table_name) VALUES ('products');

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Added Supabase sync columns to product_categories and products', ${Date.now()}),
      (lower(hex(randomblob(16))), 'Created sync_outbox table for offline-first sync', ${Date.now()}),
      (lower(hex(randomblob(16))), 'Created sync_state table for tracking last sync timestamps', ${Date.now()});
    `,
    down: `
      DROP TABLE IF EXISTS sync_state;
      DROP TABLE IF EXISTS sync_outbox;
      
      ALTER TABLE products DROP COLUMN updated_at_iso;
      ALTER TABLE products DROP COLUMN created_at_iso;
      ALTER TABLE products DROP COLUMN deleted_at;
      ALTER TABLE products DROP COLUMN device_id;
      ALTER TABLE products DROP COLUMN business_id;

      ALTER TABLE product_categories DROP COLUMN updated_at_iso;
      ALTER TABLE product_categories DROP COLUMN created_at_iso;
      ALTER TABLE product_categories DROP COLUMN deleted_at;
      ALTER TABLE product_categories DROP COLUMN device_id;
      ALTER TABLE product_categories DROP COLUMN business_id;
    `,
  },
  {
    version: 24,
    up: `
      CREATE TABLE inventory_items_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL CHECK(unit IN ('pcs', 'kg', 'g', 'L', 'mL')),
        reorder_level_qty REAL NOT NULL DEFAULT 0,
        storage_group TEXT NOT NULL DEFAULT 'FREEZER' CHECK(storage_group IN ('FREEZER', 'CART', 'PACKAGING_SUPPLY', 'CONDIMENTS')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT INTO inventory_items_new (id, name, unit, reorder_level_qty, storage_group, is_active, created_at, updated_at)
      SELECT id, name, unit, reorder_level_qty, storage_group, is_active, created_at, updated_at FROM inventory_items;

      DROP TABLE inventory_items;
      ALTER TABLE inventory_items_new RENAME TO inventory_items;

      CREATE INDEX idx_inventory_items_is_active ON inventory_items(is_active);
      CREATE INDEX idx_inventory_items_name ON inventory_items(name);

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Updated inventory_items storage_group constraint to include PACKAGING_SUPPLY and CONDIMENTS', ${Date.now()});
    `,
    down: `
      CREATE TABLE inventory_items_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL CHECK(unit IN ('pcs', 'kg', 'g', 'L', 'mL')),
        reorder_level_qty REAL NOT NULL DEFAULT 0,
        storage_group TEXT NOT NULL DEFAULT 'FREEZER' CHECK(storage_group IN ('FREEZER', 'CART')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT INTO inventory_items_new (id, name, unit, reorder_level_qty, storage_group, is_active, created_at, updated_at)
      SELECT id, name, unit, reorder_level_qty, storage_group, is_active, created_at, updated_at FROM inventory_items
      WHERE storage_group IN ('FREEZER', 'CART');

      DROP TABLE inventory_items;
      ALTER TABLE inventory_items_new RENAME TO inventory_items;

      CREATE INDEX idx_inventory_items_is_active ON inventory_items(is_active);
      CREATE INDEX idx_inventory_items_name ON inventory_items(name);
    `,
  },
  {
    version: 25,
    up: `
      ALTER TABLE inventory_items ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0;

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Added price_cents to inventory_items table', ${Date.now()});
    `,
    down: `
      CREATE TABLE inventory_items_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL CHECK(unit IN ('pcs', 'kg', 'g', 'L', 'mL')),
        reorder_level_qty REAL NOT NULL DEFAULT 0,
        storage_group TEXT NOT NULL DEFAULT 'FREEZER' CHECK(storage_group IN ('FREEZER', 'CART', 'PACKAGING_SUPPLY', 'CONDIMENTS')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT INTO inventory_items_new (id, name, unit, reorder_level_qty, storage_group, is_active, created_at, updated_at)
      SELECT id, name, unit, reorder_level_qty, storage_group, is_active, created_at, updated_at FROM inventory_items;

      DROP TABLE inventory_items;
      ALTER TABLE inventory_items_new RENAME TO inventory_items;

      CREATE INDEX idx_inventory_items_is_active ON inventory_items(is_active);
      CREATE INDEX idx_inventory_items_name ON inventory_items(name);
    `,
  },
  {
    version: 26,
    up: `
      ALTER TABLE inventory_items ADD COLUMN current_qty REAL NOT NULL DEFAULT 0;

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Added current_qty to inventory_items table for quantity tracking', ${Date.now()});
    `,
    down: `
      CREATE TABLE inventory_items_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL CHECK(unit IN ('pcs', 'kg', 'g', 'L', 'mL')),
        reorder_level_qty REAL NOT NULL DEFAULT 0,
        storage_group TEXT NOT NULL DEFAULT 'FREEZER' CHECK(storage_group IN ('FREEZER', 'CART', 'PACKAGING_SUPPLY', 'CONDIMENTS')),
        price_cents INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT INTO inventory_items_new (id, name, unit, reorder_level_qty, storage_group, price_cents, is_active, created_at, updated_at)
      SELECT id, name, unit, reorder_level_qty, storage_group, price_cents, is_active, created_at, updated_at FROM inventory_items;

      DROP TABLE inventory_items;
      ALTER TABLE inventory_items_new RENAME TO inventory_items;

      CREATE INDEX idx_inventory_items_is_active ON inventory_items(is_active);
      CREATE INDEX idx_inventory_items_name ON inventory_items(name);
    `,
  },
  {
    version: 27,
    up: `
      CREATE TABLE inventory_items_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL CHECK(unit IN ('pcs', 'kg', 'g', 'L', 'mL', 'bundle', 'pack')),
        reorder_level_qty REAL NOT NULL DEFAULT 0,
        storage_group TEXT NOT NULL DEFAULT 'FREEZER' CHECK(storage_group IN ('FREEZER', 'CART', 'PACKAGING_SUPPLY', 'CONDIMENTS')),
        price_cents INTEGER NOT NULL DEFAULT 0,
        current_qty REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT INTO inventory_items_new (id, name, unit, reorder_level_qty, storage_group, price_cents, current_qty, is_active, created_at, updated_at)
      SELECT id, name, unit, reorder_level_qty, storage_group, price_cents, current_qty, is_active, created_at, updated_at FROM inventory_items;

      DROP TABLE inventory_items;
      ALTER TABLE inventory_items_new RENAME TO inventory_items;

      CREATE INDEX idx_inventory_items_is_active ON inventory_items(is_active);
      CREATE INDEX idx_inventory_items_name ON inventory_items(name);

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Added bundle and pack units to inventory_items table', ${Date.now()});
    `,
    down: `
      CREATE TABLE inventory_items_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL CHECK(unit IN ('pcs', 'kg', 'g', 'L', 'mL')),
        reorder_level_qty REAL NOT NULL DEFAULT 0,
        storage_group TEXT NOT NULL DEFAULT 'FREEZER' CHECK(storage_group IN ('FREEZER', 'CART', 'PACKAGING_SUPPLY', 'CONDIMENTS')),
        price_cents INTEGER NOT NULL DEFAULT 0,
        current_qty REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT INTO inventory_items_new (id, name, unit, reorder_level_qty, storage_group, price_cents, current_qty, is_active, created_at, updated_at)
      SELECT id, name, unit, reorder_level_qty, storage_group, price_cents, current_qty, is_active, created_at, updated_at FROM inventory_items
      WHERE unit IN ('pcs', 'kg', 'g', 'L', 'mL');

      DROP TABLE inventory_items;
      ALTER TABLE inventory_items_new RENAME TO inventory_items;

      CREATE INDEX idx_inventory_items_is_active ON inventory_items(is_active);
      CREATE INDEX idx_inventory_items_name ON inventory_items(name);
    `,
  },
  {
    version: 28,
    up: `
      CREATE TABLE IF NOT EXISTS inventory_storage_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX idx_inventory_storage_groups_is_active ON inventory_storage_groups(is_active);
      CREATE INDEX idx_inventory_storage_groups_sort_order ON inventory_storage_groups(sort_order);

      INSERT INTO inventory_storage_groups (id, name, sort_order, is_active, created_at, updated_at)
      SELECT 
        lower(hex(randomblob(16))),
        'Freezer',
        0,
        1,
        ${Date.now()},
        ${Date.now()}
      WHERE NOT EXISTS (SELECT 1 FROM inventory_storage_groups WHERE name = 'Freezer');

      INSERT INTO inventory_storage_groups (id, name, sort_order, is_active, created_at, updated_at)
      SELECT 
        lower(hex(randomblob(16))),
        'Cart',
        1,
        1,
        ${Date.now()},
        ${Date.now()}
      WHERE NOT EXISTS (SELECT 1 FROM inventory_storage_groups WHERE name = 'Cart');

      INSERT INTO inventory_storage_groups (id, name, sort_order, is_active, created_at, updated_at)
      SELECT 
        lower(hex(randomblob(16))),
        'Packaging Supply',
        2,
        1,
        ${Date.now()},
        ${Date.now()}
      WHERE NOT EXISTS (SELECT 1 FROM inventory_storage_groups WHERE name = 'Packaging Supply');

      INSERT INTO inventory_storage_groups (id, name, sort_order, is_active, created_at, updated_at)
      SELECT 
        lower(hex(randomblob(16))),
        'Condiments',
        3,
        1,
        ${Date.now()},
        ${Date.now()}
      WHERE NOT EXISTS (SELECT 1 FROM inventory_storage_groups WHERE name = 'Condiments');

      ALTER TABLE inventory_items ADD COLUMN storage_group_id TEXT;

      UPDATE inventory_items 
      SET storage_group_id = (
        SELECT id FROM inventory_storage_groups 
        WHERE 
          (inventory_items.storage_group = 'FREEZER' AND name = 'Freezer') OR
          (inventory_items.storage_group = 'CART' AND name = 'Cart') OR
          (inventory_items.storage_group = 'PACKAGING_SUPPLY' AND name = 'Packaging Supply') OR
          (inventory_items.storage_group = 'CONDIMENTS' AND name = 'Condiments')
        LIMIT 1
      );

      CREATE INDEX idx_inventory_items_storage_group_id ON inventory_items(storage_group_id);

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Created inventory_storage_groups table and added storage_group_id to inventory_items', ${Date.now()});
    `,
    down: `
      DROP INDEX IF EXISTS idx_inventory_items_storage_group_id;
      
      CREATE TABLE inventory_items_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL CHECK(unit IN ('pcs', 'kg', 'g', 'L', 'mL', 'bundle', 'pack')),
        reorder_level_qty REAL NOT NULL DEFAULT 0,
        storage_group TEXT NOT NULL DEFAULT 'FREEZER' CHECK(storage_group IN ('FREEZER', 'CART', 'PACKAGING_SUPPLY', 'CONDIMENTS')),
        price_cents INTEGER NOT NULL DEFAULT 0,
        current_qty REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT INTO inventory_items_new (id, name, unit, reorder_level_qty, storage_group, price_cents, current_qty, is_active, created_at, updated_at)
      SELECT id, name, unit, reorder_level_qty, storage_group, price_cents, current_qty, is_active, created_at, updated_at FROM inventory_items;

      DROP TABLE inventory_items;
      ALTER TABLE inventory_items_new RENAME TO inventory_items;

      CREATE INDEX idx_inventory_items_is_active ON inventory_items(is_active);
      CREATE INDEX idx_inventory_items_name ON inventory_items(name);

      DROP TABLE IF EXISTS inventory_storage_groups;
    `,
  },
  {
    version: 29,
    up: `
      ALTER TABLE carts ADD COLUMN business_id TEXT NOT NULL DEFAULT 'default_business';
      ALTER TABLE carts ADD COLUMN device_id TEXT;
      ALTER TABLE carts ADD COLUMN deleted_at TEXT;
      ALTER TABLE carts ADD COLUMN created_at_iso TEXT;
      ALTER TABLE carts ADD COLUMN updated_at_iso TEXT;

      ALTER TABLE inventory_storage_groups ADD COLUMN business_id TEXT NOT NULL DEFAULT 'default_business';
      ALTER TABLE inventory_storage_groups ADD COLUMN device_id TEXT;
      ALTER TABLE inventory_storage_groups ADD COLUMN deleted_at TEXT;
      ALTER TABLE inventory_storage_groups ADD COLUMN created_at_iso TEXT;
      ALTER TABLE inventory_storage_groups ADD COLUMN updated_at_iso TEXT;

      ALTER TABLE inventory_items ADD COLUMN business_id TEXT NOT NULL DEFAULT 'default_business';
      ALTER TABLE inventory_items ADD COLUMN device_id TEXT;
      ALTER TABLE inventory_items ADD COLUMN deleted_at TEXT;
      ALTER TABLE inventory_items ADD COLUMN created_at_iso TEXT;
      ALTER TABLE inventory_items ADD COLUMN updated_at_iso TEXT;

      DROP TABLE IF EXISTS sync_outbox;
      CREATE TABLE sync_outbox (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        row_id TEXT NOT NULL,
        op TEXT NOT NULL CHECK(op IN ('upsert', 'delete')),
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );

      CREATE INDEX idx_sync_outbox_table_name ON sync_outbox(table_name);
      CREATE INDEX idx_sync_outbox_created_at ON sync_outbox(created_at);

      INSERT OR IGNORE INTO sync_state (table_name) VALUES ('carts');
      INSERT OR IGNORE INTO sync_state (table_name) VALUES ('inventory_storage_groups');
      INSERT OR IGNORE INTO sync_state (table_name) VALUES ('inventory_items');

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Added Supabase sync columns to carts, inventory_storage_groups, and inventory_items', ${Date.now()}),
      (lower(hex(randomblob(16))), 'Removed CHECK constraint from sync_outbox.table_name to support arbitrary tables', ${Date.now()}),
      (lower(hex(randomblob(16))), 'Added sync_state entries for carts, inventory_storage_groups, and inventory_items', ${Date.now()});
    `,
    down: `
      DROP TABLE IF EXISTS sync_outbox;
      CREATE TABLE sync_outbox (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL CHECK(table_name IN ('product_categories', 'products')),
        row_id TEXT NOT NULL,
        op TEXT NOT NULL CHECK(op IN ('upsert', 'delete')),
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );

      CREATE INDEX idx_sync_outbox_table_name ON sync_outbox(table_name);
      CREATE INDEX idx_sync_outbox_created_at ON sync_outbox(created_at);

      DELETE FROM sync_state WHERE table_name IN ('carts', 'inventory_storage_groups', 'inventory_items');

      ALTER TABLE inventory_items DROP COLUMN updated_at_iso;
      ALTER TABLE inventory_items DROP COLUMN created_at_iso;
      ALTER TABLE inventory_items DROP COLUMN deleted_at;
      ALTER TABLE inventory_items DROP COLUMN device_id;
      ALTER TABLE inventory_items DROP COLUMN business_id;

      ALTER TABLE inventory_storage_groups DROP COLUMN updated_at_iso;
      ALTER TABLE inventory_storage_groups DROP COLUMN created_at_iso;
      ALTER TABLE inventory_storage_groups DROP COLUMN deleted_at;
      ALTER TABLE inventory_storage_groups DROP COLUMN device_id;
      ALTER TABLE inventory_storage_groups DROP COLUMN business_id;

      ALTER TABLE carts DROP COLUMN updated_at_iso;
      ALTER TABLE carts DROP COLUMN created_at_iso;
      ALTER TABLE carts DROP COLUMN deleted_at;
      ALTER TABLE carts DROP COLUMN device_id;
      ALTER TABLE carts DROP COLUMN business_id;
    `,
  },
  {
    version: 30,
    up: `
      ALTER TABLE inventory_storage_groups ADD COLUMN normalized_name TEXT;

      UPDATE inventory_storage_groups 
      SET normalized_name = LOWER(TRIM(REPLACE(REPLACE(REPLACE(name, '  ', ' '), '  ', ' '), '  ', ' ')));

      CREATE UNIQUE INDEX idx_inventory_storage_groups_normalized_name 
      ON inventory_storage_groups(normalized_name) 
      WHERE is_active = 1;

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Added normalized_name column to inventory_storage_groups for case-insensitive duplicate detection', ${Date.now()});
    `,
    down: `
      DROP INDEX IF EXISTS idx_inventory_storage_groups_normalized_name;
      
      CREATE TABLE inventory_storage_groups_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        business_id TEXT NOT NULL DEFAULT 'default_business',
        device_id TEXT,
        deleted_at TEXT,
        created_at_iso TEXT,
        updated_at_iso TEXT
      );

      INSERT INTO inventory_storage_groups_new 
      SELECT id, name, sort_order, is_active, created_at, updated_at, business_id, device_id, deleted_at, created_at_iso, updated_at_iso 
      FROM inventory_storage_groups;

      DROP TABLE inventory_storage_groups;
      ALTER TABLE inventory_storage_groups_new RENAME TO inventory_storage_groups;

      CREATE INDEX idx_inventory_storage_groups_is_active ON inventory_storage_groups(is_active);
      CREATE INDEX idx_inventory_storage_groups_sort_order ON inventory_storage_groups(sort_order);
    `,
  },
  {
    version: 31,
    up: `
      ALTER TABLE users ADD COLUMN pin_hash_alg TEXT;
      ALTER TABLE users ADD COLUMN business_id TEXT NOT NULL DEFAULT 'default_business';
      ALTER TABLE users ADD COLUMN device_id TEXT;
      ALTER TABLE users ADD COLUMN deleted_at TEXT;
      ALTER TABLE users ADD COLUMN created_at_iso TEXT;
      ALTER TABLE users ADD COLUMN updated_at_iso TEXT;

      UPDATE users SET pin_hash_alg = 'sha256-v1' WHERE pin IS NOT NULL;

      INSERT OR IGNORE INTO sync_state (table_name) VALUES ('users');

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Added Supabase sync columns to users table', ${Date.now()}),
      (lower(hex(randomblob(16))), 'Added pin_hash_alg column to users table for PIN hash version tracking', ${Date.now()}),
      (lower(hex(randomblob(16))), 'Added sync_state entry for users table', ${Date.now()});
    `,
    down: `
      DELETE FROM sync_state WHERE table_name = 'users';
      
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('boss', 'boss2', 'worker', 'inventory_clerk', 'developer')),
        pin TEXT,
        password_hash TEXT,
        email TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        profile_image_uri TEXT
      );

      INSERT INTO users_new (id, name, role, pin, password_hash, email, created_at, updated_at, is_active, profile_image_uri)
      SELECT id, name, role, pin, password_hash, email, created_at, updated_at, is_active, profile_image_uri FROM users;

      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `,
  },
  {
    version: 32,
    up: `
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('general_manager', 'developer', 'operation_manager', 'inventory_clerk')),
        pin TEXT,
        pin_hash_alg TEXT,
        password_hash TEXT,
        email TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        profile_image_uri TEXT,
        business_id TEXT NOT NULL DEFAULT 'default_business',
        device_id TEXT,
        deleted_at TEXT,
        created_at_iso TEXT,
        updated_at_iso TEXT
      );

      INSERT INTO users_new (
        id, name, role, pin, pin_hash_alg, password_hash, email, 
        created_at, updated_at, is_active, profile_image_uri, 
        business_id, device_id, deleted_at, created_at_iso, updated_at_iso
      )
      SELECT 
        id, 
        name, 
        CASE 
          WHEN role = 'boss' THEN 'general_manager'
          WHEN role = 'boss2' THEN 'developer'
          WHEN role = 'worker' THEN 'operation_manager'
          WHEN role = 'inventory_clerk' THEN 'inventory_clerk'
          WHEN role = 'developer' THEN 'developer'
          ELSE 'general_manager'
        END as role,
        pin, 
        pin_hash_alg, 
        password_hash, 
        email, 
        created_at, 
        updated_at, 
        is_active, 
        profile_image_uri, 
        business_id, 
        device_id, 
        deleted_at, 
        created_at_iso, 
        updated_at_iso
      FROM users;

      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Migrated user roles: boss->general_manager, boss2->developer, worker->operation_manager', ${Date.now()});
    `,
    down: `
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('boss', 'boss2', 'worker', 'inventory_clerk', 'developer')),
        pin TEXT,
        pin_hash_alg TEXT,
        password_hash TEXT,
        email TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        profile_image_uri TEXT,
        business_id TEXT NOT NULL DEFAULT 'default_business',
        device_id TEXT,
        deleted_at TEXT,
        created_at_iso TEXT,
        updated_at_iso TEXT
      );

      INSERT INTO users_new SELECT * FROM users WHERE role IN ('boss', 'boss2', 'worker', 'inventory_clerk', 'developer');
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `,
  },
  {
    version: 33,
    up: `
      ALTER TABLE users ADD COLUMN pin_hash TEXT;

      UPDATE users SET pin_hash = pin WHERE pin IS NOT NULL;

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Added pin_hash column to users table for secure PIN storage', ${Date.now()});
    `,
    down: `
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('general_manager', 'developer', 'operation_manager', 'inventory_clerk')),
        pin TEXT,
        pin_hash_alg TEXT,
        password_hash TEXT,
        email TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        profile_image_uri TEXT,
        business_id TEXT NOT NULL DEFAULT 'default_business',
        device_id TEXT,
        deleted_at TEXT,
        created_at_iso TEXT,
        updated_at_iso TEXT
      );

      INSERT INTO users_new SELECT id, name, role, pin, pin_hash_alg, password_hash, email, created_at, updated_at, is_active, profile_image_uri, business_id, device_id, deleted_at, created_at_iso, updated_at_iso FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `,
  },
  {
    version: 34,
    up: `
      ALTER TABLE users ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Added is_system column to users table for built-in accounts', ${Date.now()});
    `,
    down: `
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('general_manager', 'developer', 'operation_manager', 'inventory_clerk')),
        pin TEXT,
        pin_hash TEXT,
        pin_hash_alg TEXT,
        password_hash TEXT,
        email TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        profile_image_uri TEXT,
        business_id TEXT NOT NULL DEFAULT 'default_business',
        device_id TEXT,
        deleted_at TEXT,
        created_at_iso TEXT,
        updated_at_iso TEXT
      );

      INSERT INTO users_new SELECT id, name, role, pin, pin_hash, pin_hash_alg, password_hash, email, created_at, updated_at, is_active, profile_image_uri, business_id, device_id, deleted_at, created_at_iso, updated_at_iso FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `,
  },
  {
    version: 35,
    up: `
      UPDATE users SET pin_hash = NULL, pin_hash_alg = NULL WHERE 1=1;

      UPDATE users 
      SET pin = '1234', is_system = 1, is_active = 1, deleted_at = NULL 
      WHERE id = 'system-user-general-manager';

      UPDATE users 
      SET pin = '2345', is_system = 1, is_active = 1, deleted_at = NULL 
      WHERE id = 'system-user-developer';

      UPDATE users 
      SET pin = '1111', is_system = 1, is_active = 1, deleted_at = NULL 
      WHERE id = 'system-user-operation-manager';

      UPDATE users 
      SET pin = '2222', is_system = 1, is_active = 1, deleted_at = NULL 
      WHERE id = 'system-user-inventory-clerk';

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Migrated to plain-text PINs: reset pin_hash/pin_hash_alg to NULL, restored system user PINs', ${Date.now()});
    `,
    down: `
    `,
  },
  {
    version: 36,
    up: `
      ALTER TABLE expenses ADD COLUMN business_id TEXT NOT NULL DEFAULT 'default_business';
      ALTER TABLE expenses ADD COLUMN device_id TEXT;
      ALTER TABLE expenses ADD COLUMN deleted_at TEXT;
      ALTER TABLE expenses ADD COLUMN created_at_iso TEXT;
      ALTER TABLE expenses ADD COLUMN updated_at_iso TEXT;

      CREATE INDEX idx_expenses_deleted_at ON expenses(deleted_at);

      INSERT OR IGNORE INTO sync_state (table_name) VALUES ('expenses');

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Added Supabase sync columns to expenses table', ${Date.now()});
    `,
    down: `
      DROP INDEX IF EXISTS idx_expenses_deleted_at;
      
      DELETE FROM sync_state WHERE table_name = 'expenses';

      CREATE TABLE expenses_new (
        id TEXT PRIMARY KEY,
        shift_id TEXT,
        cart_id TEXT NOT NULL,
        submitted_by_user_id TEXT NOT NULL,
        approved_by_user_id TEXT,
        status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'DRAFT')),
        category TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        paid_from TEXT NOT NULL CHECK(paid_from IN ('CASH_DRAWER', 'PERSONAL', 'COMPANY')),
        notes TEXT,
        receipt_image_uri TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        reviewed_at INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (shift_id) REFERENCES worker_shifts(id),
        FOREIGN KEY (cart_id) REFERENCES carts(id),
        FOREIGN KEY (submitted_by_user_id) REFERENCES users(id),
        FOREIGN KEY (approved_by_user_id) REFERENCES users(id)
      );

      INSERT INTO expenses_new (id, shift_id, cart_id, submitted_by_user_id, approved_by_user_id, status, category, amount_cents, paid_from, notes, receipt_image_uri, created_at, updated_at, reviewed_at, is_deleted)
      SELECT id, shift_id, cart_id, submitted_by_user_id, approved_by_user_id, status, category, amount_cents, paid_from, notes, receipt_image_uri, created_at, updated_at, reviewed_at, is_deleted FROM expenses;

      DROP TABLE expenses;
      ALTER TABLE expenses_new RENAME TO expenses;

      CREATE INDEX idx_expenses_shift_id ON expenses(shift_id);
      CREATE INDEX idx_expenses_status ON expenses(status);
      CREATE INDEX idx_expenses_submitted_by ON expenses(submitted_by_user_id);
      CREATE INDEX idx_expenses_created_at ON expenses(created_at);
      CREATE INDEX idx_expenses_is_deleted ON expenses(is_deleted);
    `,
  },
  {
    version: 37,
    up: `
      ALTER TABLE worker_shifts ADD COLUMN business_id TEXT NOT NULL DEFAULT 'default_business';
      ALTER TABLE worker_shifts ADD COLUMN device_id TEXT;
      ALTER TABLE worker_shifts ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE worker_shifts ADD COLUMN deleted_at TEXT;
      ALTER TABLE worker_shifts ADD COLUMN created_at_iso TEXT;
      ALTER TABLE worker_shifts ADD COLUMN updated_at_iso TEXT;

      CREATE INDEX idx_worker_shifts_deleted_at ON worker_shifts(deleted_at);
      CREATE INDEX idx_worker_shifts_is_deleted ON worker_shifts(is_deleted);

      INSERT OR IGNORE INTO sync_state (table_name) VALUES ('worker_shifts');

      INSERT INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Added Supabase sync columns to worker_shifts table', ${Date.now()});
    `,
    down: `
      DROP INDEX IF EXISTS idx_worker_shifts_deleted_at;
      DROP INDEX IF EXISTS idx_worker_shifts_is_deleted;
      
      DELETE FROM sync_state WHERE table_name = 'worker_shifts';

      CREATE TABLE worker_shifts_new (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        cart_id TEXT NOT NULL,
        clock_in INTEGER,
        clock_out INTEGER,
        starting_cash_cents INTEGER DEFAULT 0,
        expected_cash_cents INTEGER DEFAULT 0,
        notes TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('assigned', 'active', 'ended')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        synced_at INTEGER,
        FOREIGN KEY (worker_id) REFERENCES users(id),
        FOREIGN KEY (cart_id) REFERENCES carts(id)
      );

      INSERT INTO worker_shifts_new (id, worker_id, cart_id, clock_in, clock_out, starting_cash_cents, expected_cash_cents, notes, status, created_at, updated_at, synced_at)
      SELECT id, worker_id, cart_id, clock_in, clock_out, starting_cash_cents, expected_cash_cents, notes, status, created_at, updated_at, synced_at FROM worker_shifts;

      DROP TABLE worker_shifts;
      ALTER TABLE worker_shifts_new RENAME TO worker_shifts;

      CREATE INDEX idx_worker_shifts_worker_id ON worker_shifts(worker_id);
      CREATE INDEX idx_worker_shifts_cart_id ON worker_shifts(cart_id);
    `,
  },
  {
    version: 38,
    up: `
      DROP TABLE IF EXISTS settlements_new;

      CREATE TABLE settlements_new (
        id TEXT PRIMARY KEY,
        shift_id TEXT NOT NULL,
        cart_id TEXT NOT NULL,
        seller_user_id TEXT NOT NULL,
        date_iso TEXT,
        status TEXT NOT NULL DEFAULT 'SAVED' CHECK(status IN ('SAVED', 'FINALIZED')),
        notes TEXT,
        cash_cents INTEGER NOT NULL DEFAULT 0,
        gcash_cents INTEGER NOT NULL DEFAULT 0,
        card_cents INTEGER NOT NULL DEFAULT 0,
        gross_sales_cents INTEGER NOT NULL DEFAULT 0,
        total_cents INTEGER NOT NULL DEFAULT 0,
        business_id TEXT NOT NULL DEFAULT 'default_business',
        device_id TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_at_iso TEXT,
        updated_at_iso TEXT,
        FOREIGN KEY (shift_id) REFERENCES worker_shifts(id),
        FOREIGN KEY (cart_id) REFERENCES carts(id),
        FOREIGN KEY (seller_user_id) REFERENCES users(id)
      );

      INSERT INTO settlements_new (
        id, shift_id, cart_id, seller_user_id, date_iso, status, notes,
        cash_cents, gcash_cents, card_cents, gross_sales_cents, total_cents,
        business_id, device_id, is_deleted, deleted_at,
        created_at, updated_at, created_at_iso, updated_at_iso
      )
      SELECT 
        s.id, 
        s.shift_id, 
        s.cart_id, 
        COALESCE(
          (SELECT seller_user_id FROM settlements WHERE id = s.id),
          (SELECT worker_user_id FROM settlements WHERE id = s.id),
          'unknown'
        ) as seller_user_id,
        COALESCE(
          (SELECT settlement_day FROM settlements WHERE id = s.id),
          date('now')
        ) as date_iso,
        CASE 
          WHEN s.status IN ('DRAFT', 'draft', 'saved', 'SAVED') THEN 'SAVED' 
          WHEN s.status IN ('FINALIZED', 'finalized') THEN 'FINALIZED' 
          ELSE 'SAVED' 
        END as status,
        s.notes,
        0, 0, 0, 0, 0,
        COALESCE(
          (SELECT business_id FROM settlements WHERE id = s.id),
          'default_business'
        ) as business_id,
        (SELECT device_id FROM settlements WHERE id = s.id) as device_id,
        COALESCE(
          (SELECT is_deleted FROM settlements WHERE id = s.id),
          0
        ) as is_deleted,
        (SELECT deleted_at FROM settlements WHERE id = s.id) as deleted_at,
        s.created_at, 
        s.updated_at, 
        (SELECT created_at_iso FROM settlements WHERE id = s.id) as created_at_iso,
        (SELECT updated_at_iso FROM settlements WHERE id = s.id) as updated_at_iso
      FROM (SELECT DISTINCT id, shift_id, cart_id, status, notes, created_at, updated_at FROM settlements) s;

      DROP TABLE settlements;
      ALTER TABLE settlements_new RENAME TO settlements;

      CREATE INDEX IF NOT EXISTS idx_settlements_shift_id ON settlements(shift_id);
      CREATE INDEX IF NOT EXISTS idx_settlements_cart_id ON settlements(cart_id);
      CREATE INDEX IF NOT EXISTS idx_settlements_seller_user_id ON settlements(seller_user_id);
      CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
      CREATE INDEX IF NOT EXISTS idx_settlements_deleted_at ON settlements(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_settlements_is_deleted ON settlements(is_deleted);
      CREATE INDEX IF NOT EXISTS idx_settlements_updated_at_iso ON settlements(updated_at_iso);

      CREATE TABLE IF NOT EXISTS settlement_items (
        id TEXT PRIMARY KEY,
        settlement_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        qty INTEGER NOT NULL,
        price_cents INTEGER NOT NULL,
        business_id TEXT NOT NULL DEFAULT 'default_business',
        device_id TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_at_iso TEXT,
        updated_at_iso TEXT,
        FOREIGN KEY (settlement_id) REFERENCES settlements(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      );

      CREATE INDEX IF NOT EXISTS idx_settlement_items_settlement_id ON settlement_items(settlement_id);
      CREATE INDEX IF NOT EXISTS idx_settlement_items_product_id ON settlement_items(product_id);
      CREATE INDEX IF NOT EXISTS idx_settlement_items_deleted_at ON settlement_items(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_settlement_items_is_deleted ON settlement_items(is_deleted);
      CREATE INDEX IF NOT EXISTS idx_settlement_items_updated_at_iso ON settlement_items(updated_at_iso);

      INSERT OR IGNORE INTO sync_state (table_name) VALUES ('settlements');
      INSERT OR IGNORE INTO sync_state (table_name) VALUES ('settlement_items');

      INSERT OR IGNORE INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Added Supabase sync columns to settlements table', ${Date.now()}),
      (lower(hex(randomblob(16))), 'Created settlement_items table for synced product-level settlement data', ${Date.now()}),
      (lower(hex(randomblob(16))), 'Migrated settlement status values to uppercase: SAVED, FINALIZED', ${Date.now()});
    `,
    down: `
      DROP TABLE IF EXISTS settlement_items;
      DROP INDEX IF EXISTS idx_settlements_deleted_at;
      DROP INDEX IF EXISTS idx_settlements_is_deleted;
      DROP INDEX IF EXISTS idx_settlements_updated_at_iso;
      
      DELETE FROM sync_state WHERE table_name IN ('settlements', 'settlement_items');
    `,
  },
  {
    version: 39,
    up: `
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('settlement_incoming', 'expense_pending', 'shift_ended')),
        entity_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        seen_at INTEGER,
        created_at INTEGER NOT NULL,
        business_id TEXT NOT NULL DEFAULT 'default_business',
        device_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
      CREATE INDEX IF NOT EXISTS idx_notifications_entity_id ON notifications(entity_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_seen_at ON notifications(seen_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

      INSERT OR IGNORE INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Created notifications table for settlement badges and alerts', ${Date.now()});
    `,
    down: `
      DROP TABLE IF EXISTS notifications;
      DROP INDEX IF EXISTS idx_notifications_type;
      DROP INDEX IF EXISTS idx_notifications_entity_id;
      DROP INDEX IF EXISTS idx_notifications_seen_at;
      DROP INDEX IF EXISTS idx_notifications_created_at;
    `,
  },
  {
    version: 40,
    up: `
      PRAGMA foreign_keys = OFF;

      DROP TABLE IF EXISTS settlements_temp;

      CREATE TABLE settlements_temp (
        id TEXT PRIMARY KEY,
        shift_id TEXT NOT NULL,
        cart_id TEXT NOT NULL,
        seller_user_id TEXT NOT NULL,
        date_iso TEXT,
        status TEXT NOT NULL DEFAULT 'SAVED' CHECK(status IN ('SAVED', 'FINALIZED')),
        notes TEXT,
        cash_cents INTEGER NOT NULL DEFAULT 0,
        gcash_cents INTEGER NOT NULL DEFAULT 0,
        card_cents INTEGER NOT NULL DEFAULT 0,
        gross_sales_cents INTEGER NOT NULL DEFAULT 0,
        total_cents INTEGER NOT NULL DEFAULT 0,
        business_id TEXT NOT NULL DEFAULT 'default_business',
        device_id TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_at_iso TEXT,
        updated_at_iso TEXT,
        FOREIGN KEY (shift_id) REFERENCES worker_shifts(id),
        FOREIGN KEY (cart_id) REFERENCES carts(id),
        FOREIGN KEY (seller_user_id) REFERENCES users(id)
      );

      INSERT INTO settlements_temp (
        id, shift_id, cart_id, seller_user_id, date_iso, status, notes,
        cash_cents, gcash_cents, card_cents, gross_sales_cents, total_cents,
        business_id, device_id, is_deleted, deleted_at,
        created_at, updated_at, created_at_iso, updated_at_iso
      )
      SELECT 
        id, shift_id, cart_id, seller_user_id, date_iso,
        CASE 
          WHEN UPPER(status) = 'SAVED' OR UPPER(status) = 'DRAFT' THEN 'SAVED'
          WHEN UPPER(status) = 'FINALIZED' THEN 'FINALIZED'
          ELSE 'SAVED'
        END as status,
        notes,
        COALESCE(cash_cents, 0),
        COALESCE(gcash_cents, 0),
        COALESCE(card_cents, 0),
        COALESCE(gross_sales_cents, 0),
        COALESCE(total_cents, 0),
        COALESCE(business_id, 'default_business'),
        device_id,
        COALESCE(is_deleted, 0),
        deleted_at,
        created_at, updated_at, created_at_iso, updated_at_iso
      FROM settlements;

      DROP TABLE settlements;
      ALTER TABLE settlements_temp RENAME TO settlements;

      CREATE INDEX IF NOT EXISTS idx_settlements_shift_id ON settlements(shift_id);
      CREATE INDEX IF NOT EXISTS idx_settlements_cart_id ON settlements(cart_id);
      CREATE INDEX IF NOT EXISTS idx_settlements_seller_user_id ON settlements(seller_user_id);
      CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
      CREATE INDEX IF NOT EXISTS idx_settlements_deleted_at ON settlements(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_settlements_is_deleted ON settlements(is_deleted);
      CREATE INDEX IF NOT EXISTS idx_settlements_updated_at_iso ON settlements(updated_at_iso);

      PRAGMA foreign_keys = ON;

      INSERT OR IGNORE INTO db_change_log (id, message, created_at) VALUES
      (lower(hex(randomblob(16))), 'Fixed settlements CHECK constraint: status IN (SAVED, FINALIZED) - uppercase only', ${Date.now()});
    `,
    down: `
    `,
  },
];
