export const SCHEMA_VERSION = 1;

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
];
