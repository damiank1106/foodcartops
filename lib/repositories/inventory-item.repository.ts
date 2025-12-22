import { BaseRepository } from './base';
import { InventoryItem, InventoryUnit } from '../types';
import { AuditRepository } from './audit.repository';

export class InventoryItemRepository extends BaseRepository {
  private auditRepo = new AuditRepository();
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
    user_id: string;
  }): Promise<InventoryItem> {
    console.log('[InventoryItemRepository] Creating inventory item:', data.name);
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const item: InventoryItem = {
      id,
      name: data.name,
      unit: data.unit,
      reorder_level_qty: data.reorder_level_qty || 0,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO inventory_items (id, name, unit, reorder_level_qty, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.name, item.unit, item.reorder_level_qty, item.is_active, item.created_at, item.updated_at]
    );

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
    reorder_level_qty?: number;
    user_id: string;
  }): Promise<InventoryItem> {
    console.log(`[InventoryItemRepository] Updating inventory item: ${data.id}`);
    const db = await this.getDb();
    
    const existing = await this.getById(data.id);
    if (!existing) {
      throw new Error('Inventory item not found');
    }

    const now = this.now();
    const updated: InventoryItem = {
      ...existing,
      name: data.name !== undefined ? data.name : existing.name,
      unit: data.unit !== undefined ? data.unit : existing.unit,
      reorder_level_qty: data.reorder_level_qty !== undefined ? data.reorder_level_qty : existing.reorder_level_qty,
      updated_at: now,
    };

    await db.runAsync(
      `UPDATE inventory_items 
       SET name = ?, unit = ?, reorder_level_qty = ?, updated_at = ?
       WHERE id = ?`,
      [updated.name, updated.unit, updated.reorder_level_qty, updated.updated_at, updated.id]
    );

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

  async softDelete(id: string, user_id: string): Promise<void> {
    console.log(`[InventoryItemRepository] Soft deleting inventory item: ${id}`);
    const db = await this.getDb();
    
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Inventory item not found');
    }

    const now = this.now();
    await db.runAsync(
      `UPDATE inventory_items SET is_active = 0, updated_at = ? WHERE id = ?`,
      [now, id]
    );

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
    await db.runAsync(
      `UPDATE inventory_items SET is_active = 1, updated_at = ? WHERE id = ?`,
      [now, id]
    );

    await this.auditRepo.log({
      user_id,
      entity_type: 'inventory_item',
      entity_id: id,
      action: 'restore',
      new_data: JSON.stringify({ ...existing, is_active: 1 }),
    });

    console.log(`[InventoryItemRepository] Restored inventory item: ${id}`);
  }
}
