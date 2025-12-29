import { BaseRepository } from './base';
import { InventoryStorageGroup } from '../types';
import { AuditRepository } from './audit.repository';

export class InventoryStorageGroupRepository extends BaseRepository {
  private auditRepo = new AuditRepository();

  private normalizeName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  async listActive(): Promise<InventoryStorageGroup[]> {
    console.log('[InventoryStorageGroupRepository] Fetching active storage groups');
    const db = await this.getDb();
    const result = await db.getAllAsync<InventoryStorageGroup>(
      `SELECT * FROM inventory_storage_groups WHERE is_active = 1 ORDER BY sort_order ASC, name ASC`
    );
    console.log(`[InventoryStorageGroupRepository] Found ${result.length} active groups`);
    return result;
  }

  async listAll(): Promise<InventoryStorageGroup[]> {
    console.log('[InventoryStorageGroupRepository] Fetching all storage groups');
    const db = await this.getDb();
    const result = await db.getAllAsync<InventoryStorageGroup>(
      `SELECT * FROM inventory_storage_groups ORDER BY sort_order ASC, name ASC`
    );
    console.log(`[InventoryStorageGroupRepository] Found ${result.length} groups`);
    return result;
  }

  async getById(id: string): Promise<InventoryStorageGroup | null> {
    console.log(`[InventoryStorageGroupRepository] Fetching group by id: ${id}`);
    const db = await this.getDb();
    const result = await db.getFirstAsync<InventoryStorageGroup>(
      `SELECT * FROM inventory_storage_groups WHERE id = ?`,
      [id]
    );
    return result || null;
  }

  async getByName(name: string): Promise<InventoryStorageGroup | null> {
    console.log(`[InventoryStorageGroupRepository] Fetching group by name: ${name}`);
    const db = await this.getDb();
    const result = await db.getFirstAsync<InventoryStorageGroup>(
      `SELECT * FROM inventory_storage_groups WHERE name = ?`,
      [name]
    );
    return result || null;
  }

  async getByNormalizedName(name: string): Promise<InventoryStorageGroup | null> {
    console.log(`[InventoryStorageGroupRepository] Fetching group by normalized name: ${name}`);
    const db = await this.getDb();
    const trimmed = name.trim().replace(/\s+/g, ' ');
    
    const result = await db.getFirstAsync<InventoryStorageGroup>(
      `SELECT * FROM inventory_storage_groups 
       WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) 
       AND is_active = 1`,
      [trimmed]
    );
    return result || null;
  }

  async create(data: {
    name: string;
    user_id: string;
  }): Promise<InventoryStorageGroup | { existing: true; group: InventoryStorageGroup }> {
    console.log('[InventoryStorageGroupRepository] Creating storage group:', data.name);
    const db = await this.getDb();
    
    const trimmedName = data.name.trim().replace(/\s+/g, ' ');
    
    const existing = await this.getByNormalizedName(trimmedName);
    if (existing) {
      console.log('[InventoryStorageGroupRepository] Group already exists, returning existing');
      await this.auditRepo.log({
        user_id: data.user_id,
        entity_type: 'inventory_storage_group',
        entity_id: existing.id,
        action: 'storage_group_create_duplicate_selected',
        new_data: JSON.stringify({ attempted_name: trimmedName, selected_group: existing }),
      });
      return { existing: true, group: existing } as any;
    }

    const id = this.generateId();
    const now = this.now();

    const maxSortOrder = await db.getFirstAsync<{ max_sort: number | null }>(
      `SELECT MAX(sort_order) as max_sort FROM inventory_storage_groups`
    );
    const sortOrder = (maxSortOrder?.max_sort ?? -1) + 1;

    const group: InventoryStorageGroup = {
      id,
      name: trimmedName,
      sort_order: sortOrder,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };

    try {
      await db.runAsync(
        `INSERT INTO inventory_storage_groups (id, name, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [group.id, group.name, group.sort_order, group.is_active, group.created_at, group.updated_at]
      );

      await this.auditRepo.log({
        user_id: data.user_id,
        entity_type: 'inventory_storage_group',
        entity_id: id,
        action: 'storage_group_created',
        new_data: JSON.stringify(group),
      });

      console.log(`[InventoryStorageGroupRepository] Created storage group: ${id}`);
      return group;
    } catch (error: any) {
      console.log('[InventoryStorageGroupRepository] INSERT failed:', error.message);
      
      if (error.message && error.message.includes('UNIQUE constraint')) {
        console.log('[InventoryStorageGroupRepository] UNIQUE constraint violation, finding existing group');
        
        try {
          const existingGroup = await db.getFirstAsync<InventoryStorageGroup>(
            `SELECT * FROM inventory_storage_groups 
             WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))`,
            [trimmedName]
          );
          
          if (existingGroup) {
            console.log('[InventoryStorageGroupRepository] Found existing group, returning it');
            await this.auditRepo.log({
              user_id: data.user_id,
              entity_type: 'inventory_storage_group',
              entity_id: existingGroup.id,
              action: 'storage_group_create_duplicate_selected',
              new_data: JSON.stringify({ attempted_name: trimmedName, selected_group: existingGroup, error: 'UNIQUE constraint' }),
            });
            return { existing: true, group: existingGroup } as any;
          }
        } catch (queryError) {
          console.error('[InventoryStorageGroupRepository] Failed to query existing group:', queryError);
        }
        
        console.log('[InventoryStorageGroupRepository] Could not find existing group, will not crash');
        throw new Error('A storage group with this name already exists');
      }
      
      throw error;
    }
  }

  async rename(data: {
    id: string;
    name: string;
    user_id: string;
  }): Promise<InventoryStorageGroup | { error: string; current: InventoryStorageGroup }> {
    console.log(`[InventoryStorageGroupRepository] Renaming storage group: ${data.id}`);
    const db = await this.getDb();
    
    const existing = await this.getById(data.id);
    if (!existing) {
      throw new Error('Storage group not found');
    }

    const trimmedName = data.name.trim().replace(/\s+/g, ' ');
    
    if (this.normalizeName(trimmedName) === this.normalizeName(existing.name)) {
      console.log('[InventoryStorageGroupRepository] Name unchanged, skipping update');
      return existing;
    }
    
    const nameCheck = await this.getByNormalizedName(trimmedName);
    if (nameCheck && nameCheck.id !== data.id) {
      console.log('[InventoryStorageGroupRepository] Duplicate name detected (pre-check)');
      return { error: 'A storage group with this name already exists', current: existing };
    }

    const now = this.now();
    const updated: InventoryStorageGroup = {
      ...existing,
      name: trimmedName,
      updated_at: now,
    };

    try {
      await db.runAsync(
        `UPDATE inventory_storage_groups 
         SET name = ?, updated_at = ?
         WHERE id = ?`,
        [updated.name, updated.updated_at, updated.id]
      );

      await this.auditRepo.log({
        user_id: data.user_id,
        entity_type: 'inventory_storage_group',
        entity_id: data.id,
        action: 'storage_group_renamed',
        old_data: JSON.stringify(existing),
        new_data: JSON.stringify(updated),
      });

      console.log(`[InventoryStorageGroupRepository] Renamed storage group: ${data.id}`);
      return updated;
    } catch (error: any) {
      console.log('[InventoryStorageGroupRepository] UPDATE failed:', error.message);
      
      if (error.message && error.message.includes('UNIQUE constraint')) {
        console.log('[InventoryStorageGroupRepository] UNIQUE constraint violation on rename');
        return { error: 'A storage group with this name already exists', current: existing };
      }
      
      throw error;
    }
  }

  async deactivate(data: {
    id: string;
    user_id: string;
  }): Promise<void> {
    console.log(`[InventoryStorageGroupRepository] Deactivating storage group: ${data.id}`);
    const db = await this.getDb();
    
    const existing = await this.getById(data.id);
    if (!existing) {
      throw new Error('Storage group not found');
    }

    const now = this.now();
    await db.runAsync(
      `UPDATE inventory_storage_groups SET is_active = 0, updated_at = ? WHERE id = ?`,
      [now, data.id]
    );

    await db.runAsync(
      `UPDATE inventory_items SET storage_group_id = NULL WHERE storage_group_id = ?`,
      [data.id]
    );

    await this.auditRepo.log({
      user_id: data.user_id,
      entity_type: 'inventory_storage_group',
      entity_id: data.id,
      action: 'storage_group_deleted',
      old_data: JSON.stringify(existing),
    });

    console.log(`[InventoryStorageGroupRepository] Deactivated storage group: ${data.id}`);
  }
}
