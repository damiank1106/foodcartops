import { BaseRepository } from './base';
import { InventoryItem, InventoryUnit } from '../types';
import { AuditRepository } from './audit.repository';
import { SyncOutboxRepository } from './sync-outbox.repository';
import { getDeviceId } from '../utils/device-id';

export class InventoryItemRepository extends BaseRepository {
  private auditRepo = new AuditRepository();
  private syncOutbox = new SyncOutboxRepository();
  async listActive(): Promise<InventoryItem[]> {
    console.log('[InventoryItemRepository] Fetching active inventory items');
    const db = await this.getDb();
    const result = await db.getAllAsync<InventoryItem>(
      `SELECT * FROM inventory_items WHERE is_active = 1 ORDER BY name ASC`
    );
    console.log(`[InventoryItemRepository] Found ${result.length} active items`);
    return result;
  }

  async listAll(): Promise<InventoryItem[]> {
    console.log('[InventoryItemRepository] Fetching all inventory items');
    const db = await this.getDb();
    const result = await db.getAllAsync<InventoryItem>(
      `SELECT * FROM inventory_items ORDER BY name ASC`
    );
    console.log(`[InventoryItemRepository] Found ${result.length} items`);
    return result;
  }

  async getById(id: string): Promise<InventoryItem | null> {
    console.log(`[InventoryItemRepository] Fetching item by id: ${id}`);
    const db = await this.getDb();
    const result = await db.getFirstAsync<InventoryItem>(
      `SELECT * FROM inventory_items WHERE id = ?`,
      [id]
    );
    return result || null;
  }

  async create(data: {
    name: string;
    unit: InventoryUnit;
    reorder_level_qty?: number;
    storage_group?: 'FREEZER' | 'CART' | 'PACKAGING_SUPPLY' | 'CONDIMENTS';
    storage_group_id?: string;
    price_cents?: number;
    current_qty?: number;
    user_id: string;
  }): Promise<InventoryItem> {
    console.log('[InventoryItemRepository] Creating inventory item:', data.name);
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();
    const nowISO = new Date(now).toISOString();
    const deviceId = await getDeviceId();

    const item: InventoryItem = {
      id,
      name: data.name,
      unit: data.unit,
      current_qty: data.current_qty || 0,
      reorder_level_qty: data.reorder_level_qty || 0,
      storage_group: data.storage_group || 'FREEZER',
      storage_group_id: data.storage_group_id || null,
      price_cents: data.price_cents || 0,
      is_active: 1,
      created_at: now,
      updated_at: now,
      business_id: 'default_business',
      device_id: deviceId,
      created_at_iso: nowISO,
      updated_at_iso: nowISO,
    };

    await db.runAsync(
      `INSERT INTO inventory_items (id, name, unit, current_qty, reorder_level_qty, storage_group, storage_group_id, price_cents, is_active, created_at, updated_at, business_id, device_id, created_at_iso, updated_at_iso)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.name,
        item.unit,
        item.current_qty,
        item.reorder_level_qty,
        item.storage_group,
        item.storage_group_id ?? null,
        item.price_cents,
        item.is_active,
        item.created_at,
        item.updated_at,
        item.business_id ?? 'default_business',
        item.device_id ?? null,
        item.created_at_iso ?? nowISO,
        item.updated_at_iso ?? nowISO,
      ]
    );

    await this.syncOutbox.add('inventory_items', item.id, 'upsert', item);

    await this.auditRepo.log({
      user_id: data.user_id,
      entity_type: 'inventory_item',
      entity_id: id,
      action: 'create',
      new_data: JSON.stringify(item),
    });

    console.log(`[InventoryItemRepository] Created inventory item: ${id}`);
    return item;
  }

  async update(data: {
    id: string;
    name?: string;
    unit?: InventoryUnit;
    current_qty?: number;
    reorder_level_qty?: number;
    storage_group?: 'FREEZER' | 'CART' | 'PACKAGING_SUPPLY' | 'CONDIMENTS';
    storage_group_id?: string | null;
    price_cents?: number;
    user_id: string;
  }): Promise<InventoryItem> {
    console.log(`[InventoryItemRepository] Updating inventory item: ${data.id}`);
    const db = await this.getDb();
    
    const existing = await this.getById(data.id);
    if (!existing) {
      throw new Error('Inventory item not found');
    }

    const now = this.now();
    const nowISO = new Date(now).toISOString();
    const updated: InventoryItem = {
      ...existing,
      name: data.name !== undefined ? data.name : existing.name,
      unit: data.unit !== undefined ? data.unit : existing.unit,
      current_qty: data.current_qty !== undefined ? data.current_qty : existing.current_qty,
      reorder_level_qty: data.reorder_level_qty !== undefined ? data.reorder_level_qty : existing.reorder_level_qty,
      storage_group: data.storage_group !== undefined ? data.storage_group : existing.storage_group,
      storage_group_id: data.storage_group_id !== undefined ? data.storage_group_id : existing.storage_group_id,
      price_cents: data.price_cents !== undefined ? data.price_cents : existing.price_cents,
      updated_at: now,
      updated_at_iso: nowISO,
    };

    await db.runAsync(
      `UPDATE inventory_items 
       SET name = ?, unit = ?, current_qty = ?, reorder_level_qty = ?, storage_group = ?, storage_group_id = ?, price_cents = ?, updated_at = ?, updated_at_iso = ?
       WHERE id = ?`,
      [
        updated.name,
        updated.unit,
        updated.current_qty,
        updated.reorder_level_qty,
        updated.storage_group,
        updated.storage_group_id ?? null,
        updated.price_cents,
        updated.updated_at,
        updated.updated_at_iso ?? nowISO,
        updated.id,
      ]
    );

    const refreshed = await this.getById(data.id);
    if (refreshed) {
      await this.syncOutbox.add('inventory_items', data.id, 'upsert', refreshed);
    }

    await this.auditRepo.log({
      user_id: data.user_id,
      entity_type: 'inventory_item',
      entity_id: data.id,
      action: 'update',
      old_data: JSON.stringify(existing),
      new_data: JSON.stringify(updated),
    });

    console.log(`[InventoryItemRepository] Updated inventory item: ${data.id}`);
    return updated;
  }

  async updateQuantity(data: {
    id: string;
    current_qty: number;
    user_id: string;
  }): Promise<InventoryItem> {
    console.log(`[InventoryItemRepository] Updating quantity for inventory item: ${data.id}`);
    const db = await this.getDb();
    
    const existing = await this.getById(data.id);
    if (!existing) {
      throw new Error('Inventory item not found');
    }

    const now = this.now();
    const nowISO = new Date(now).toISOString();
    const updated: InventoryItem = {
      ...existing,
      current_qty: data.current_qty,
      updated_at: now,
      updated_at_iso: nowISO,
    };

    await db.runAsync(
      `UPDATE inventory_items 
       SET current_qty = ?, updated_at = ?, updated_at_iso = ?
       WHERE id = ?`,
      [updated.current_qty, updated.updated_at, updated.updated_at_iso ?? nowISO, updated.id]
    );

    const refreshed = await this.getById(data.id);
    if (refreshed) {
      console.log(`[InventoryItemRepository] DEBUG Enqueuing qty update for ${data.id}:`, {
        current_qty: refreshed.current_qty,
        name: refreshed.name,
        id: refreshed.id
      });
      await this.syncOutbox.add('inventory_items', data.id, 'upsert', refreshed);
    }

    await this.auditRepo.log({
      user_id: data.user_id,
      entity_type: 'inventory_item',
      entity_id: data.id,
      action: 'inventory_item_quantity_updated',
      old_data: JSON.stringify({ current_qty: existing.current_qty }),
      new_data: JSON.stringify({ current_qty: updated.current_qty }),
    });

    console.log(`[InventoryItemRepository] Updated quantity for inventory item: ${data.id}`);
    return updated;
  }

  async softDelete(id: string, user_id: string): Promise<void> {
    console.log(`[InventoryItemRepository] Soft deleting inventory item: ${id}`);
    const db = await this.getDb();
    
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Inventory item not found');
    }

    const now = this.now();
    const nowISO = new Date(now).toISOString();
    await db.runAsync(
      `UPDATE inventory_items SET is_active = 0, deleted_at = ?, updated_at = ?, updated_at_iso = ? WHERE id = ?`,
      [nowISO, now, nowISO, id]
    );

    const deleted = await this.getById(id);
    if (deleted) {
      await this.syncOutbox.add('inventory_items', id, 'upsert', deleted);
    }

    await this.auditRepo.log({
      user_id,
      entity_type: 'inventory_item',
      entity_id: id,
      action: 'delete',
      old_data: JSON.stringify(existing),
    });

    console.log(`[InventoryItemRepository] Soft deleted inventory item: ${id}`);
  }

  async restore(id: string, user_id: string): Promise<void> {
    console.log(`[InventoryItemRepository] Restoring inventory item: ${id}`);
    const db = await this.getDb();
    
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Inventory item not found');
    }

    const now = this.now();
    const nowISO = new Date(now).toISOString();
    await db.runAsync(
      `UPDATE inventory_items SET is_active = 1, deleted_at = NULL, updated_at = ?, updated_at_iso = ? WHERE id = ?`,
      [now, nowISO, id]
    );

    const restored = await this.getById(id);
    if (restored) {
      await this.syncOutbox.add('inventory_items', id, 'upsert', restored);
    }

    await this.auditRepo.log({
      user_id,
      entity_type: 'inventory_item',
      entity_id: id,
      action: 'restore',
      new_data: JSON.stringify({ ...existing, is_active: 1 }),
    });

    console.log(`[InventoryItemRepository] Restored inventory item: ${id}`);
  }

  async listByGroup(storage_group_id: string): Promise<InventoryItem[]> {
    console.log(`[InventoryItemRepository] Fetching items by group: ${storage_group_id}`);
    const db = await this.getDb();
    const result = await db.getAllAsync<InventoryItem>(
      `SELECT * FROM inventory_items WHERE is_active = 1 AND storage_group_id = ? ORDER BY name ASC`,
      [storage_group_id]
    );
    console.log(`[InventoryItemRepository] Found ${result.length} items in group`);
    return result;
  }
}
