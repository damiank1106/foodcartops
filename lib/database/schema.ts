export const SCHEMA_VERSION = 22;

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
];
