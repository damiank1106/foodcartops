import { BaseRepository } from './base';
import { StockLocation } from '../types';
import { AuditRepository } from './audit.repository';

export class StockLocationRepository extends BaseRepository {
  private auditRepo = new AuditRepository();

  async listActive(): Promise<StockLocation[]> {
    console.log('[StockLocationRepository] Fetching active stock locations');
    const db = await this.getDb();
    const result = await db.getAllAsync<StockLocation>(
      `SELECT * FROM stock_locations WHERE is_active = 1 ORDER BY type ASC, name ASC`
    );
    console.log(`[StockLocationRepository] Found ${result.length} active locations`);
    return result;
  }

  async getById(id: string): Promise<StockLocation | null> {
    console.log(`[StockLocationRepository] Fetching location by id: ${id}`);
    const db = await this.getDb();
    const result = await db.getFirstAsync<StockLocation>(
      `SELECT * FROM stock_locations WHERE id = ?`,
      [id]
    );
    return result || null;
  }

  async getWarehouse(): Promise<StockLocation | null> {
    console.log('[StockLocationRepository] Fetching warehouse location');
    const db = await this.getDb();
    const result = await db.getFirstAsync<StockLocation>(
      `SELECT * FROM stock_locations WHERE type = 'WAREHOUSE' AND is_active = 1 LIMIT 1`
    );
    return result || null;
  }

  async ensureWarehouse(user_id?: string): Promise<StockLocation> {
    console.log('[StockLocationRepository] Ensuring warehouse location exists');
    
    let warehouse = await this.getWarehouse();
    if (warehouse) {
      console.log('[StockLocationRepository] Warehouse already exists');
      return warehouse;
    }

    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    warehouse = {
      id,
      name: 'Warehouse',
      type: 'WAREHOUSE',
      is_active: 1,
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO stock_locations (id, name, type, cart_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [warehouse.id, warehouse.name, warehouse.type, null, warehouse.is_active, warehouse.created_at, warehouse.updated_at]
    );

    if (user_id) {
      await this.auditRepo.log({
        user_id,
        entity_type: 'stock_location',
        entity_id: id,
        action: 'create',
        new_data: JSON.stringify(warehouse),
      });
    }

    console.log('[StockLocationRepository] Created warehouse location');
    return warehouse;
  }

  async getCartLocation(cart_id: string): Promise<StockLocation | null> {
    console.log(`[StockLocationRepository] Fetching cart location for cart: ${cart_id}`);
    const db = await this.getDb();
    const result = await db.getFirstAsync<StockLocation>(
      `SELECT * FROM stock_locations WHERE type = 'CART' AND cart_id = ? AND is_active = 1`,
      [cart_id]
    );
    return result || null;
  }

  async ensureCartLocationsForActiveCarts(user_id?: string): Promise<void> {
    console.log('[StockLocationRepository] Ensuring cart locations for all active carts');
    const db = await this.getDb();

    const activeCarts = await db.getAllAsync<{ id: string; name: string }>(
      `SELECT id, name FROM carts WHERE is_active = 1`
    );

    for (const cart of activeCarts) {
      const existing = await this.getCartLocation(cart.id);
      if (!existing) {
        const id = this.generateId();
        const now = this.now();

        const location: StockLocation = {
          id,
          name: `Cart: ${cart.name}`,
          type: 'CART',
          cart_id: cart.id,
          is_active: 1,
          created_at: now,
          updated_at: now,
        };

        await db.runAsync(
          `INSERT INTO stock_locations (id, name, type, cart_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [location.id, location.name, location.type, location.cart_id || null, location.is_active, location.created_at, location.updated_at]
        );

        if (user_id) {
          await this.auditRepo.log({
            user_id,
            entity_type: 'stock_location',
            entity_id: id,
            action: 'create',
            new_data: JSON.stringify(location),
          });
        }

        console.log(`[StockLocationRepository] Created cart location for cart: ${cart.id}`);
      }
    }
  }

  async create(data: {
    name: string;
    type: 'WAREHOUSE' | 'CART';
    cart_id?: string;
    user_id: string;
  }): Promise<StockLocation> {
    console.log('[StockLocationRepository] Creating stock location:', data.name);
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const location: StockLocation = {
      id,
      name: data.name,
      type: data.type,
      cart_id: data.cart_id,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO stock_locations (id, name, type, cart_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [location.id, location.name, location.type, location.cart_id || null, location.is_active, location.created_at, location.updated_at]
    );

    await this.auditRepo.log({
      user_id: data.user_id,
      entity_type: 'stock_location',
      entity_id: id,
      action: 'create',
      new_data: JSON.stringify(location),
    });

    console.log(`[StockLocationRepository] Created stock location: ${id}`);
    return location;
  }

  async update(data: {
    id: string;
    name?: string;
    user_id: string;
  }): Promise<StockLocation> {
    console.log(`[StockLocationRepository] Updating stock location: ${data.id}`);
    const db = await this.getDb();
    
    const existing = await this.getById(data.id);
    if (!existing) {
      throw new Error('Stock location not found');
    }

    const now = this.now();
    const updated: StockLocation = {
      ...existing,
      name: data.name !== undefined ? data.name : existing.name,
      updated_at: now,
    };

    await db.runAsync(
      `UPDATE stock_locations SET name = ?, updated_at = ? WHERE id = ?`,
      [updated.name, updated.updated_at, updated.id]
    );

    await this.auditRepo.log({
      user_id: data.user_id,
      entity_type: 'stock_location',
      entity_id: data.id,
      action: 'update',
      old_data: JSON.stringify(existing),
      new_data: JSON.stringify(updated),
    });

    console.log(`[StockLocationRepository] Updated stock location: ${data.id}`);
    return updated;
  }

  async softDelete(id: string, user_id: string): Promise<void> {
    console.log(`[StockLocationRepository] Soft deleting stock location: ${id}`);
    const db = await this.getDb();
    
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Stock location not found');
    }

    const now = this.now();
    await db.runAsync(
      `UPDATE stock_locations SET is_active = 0, updated_at = ? WHERE id = ?`,
      [now, id]
    );

    await this.auditRepo.log({
      user_id,
      entity_type: 'stock_location',
      entity_id: id,
      action: 'delete',
      old_data: JSON.stringify(existing),
    });

    console.log(`[StockLocationRepository] Soft deleted stock location: ${id}`);
  }
}
