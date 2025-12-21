export const SCHEMA_VERSION = 4;

export const MIGRATIONS = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('boss', 'worker')),
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
      ALTER TABLE worker_shifts ADD COLUMN status TEXT DEFAULT 'active' CHECK(status IN ('active', 'ended'));

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
];
