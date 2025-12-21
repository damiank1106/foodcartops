import { BaseRepository } from './base';
import { BossSavedItem, BossSavedItemType, BossSavedItemSeverity, BossSavedItemStatus, BossSavedItemWithDetails } from '../types';

export class BossSavedItemsRepository extends BaseRepository {
  async create(data: {
    type: BossSavedItemType;
    title: string;
    notes?: string;
    severity?: BossSavedItemSeverity;
    status?: BossSavedItemStatus;
    linked_entity_type?: string;
    linked_entity_id?: string;
    created_by_user_id: string;
  }): Promise<BossSavedItem> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const item: BossSavedItem = {
      id,
      type: data.type,
      title: data.title,
      notes: data.notes,
      severity: data.severity || 'MEDIUM',
      status: data.status || 'OPEN',
      linked_entity_type: data.linked_entity_type,
      linked_entity_id: data.linked_entity_id,
      created_by_user_id: data.created_by_user_id,
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO boss_saved_items (
        id, type, title, notes, severity, status, 
        linked_entity_type, linked_entity_id, created_by_user_id, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.type,
        item.title,
        item.notes ?? null,
        item.severity,
        item.status,
        item.linked_entity_type ?? null,
        item.linked_entity_id ?? null,
        item.created_by_user_id,
        item.created_at,
        item.updated_at,
      ]
    );

    await this.auditLog(
      data.created_by_user_id,
      'boss_saved_item',
      item.id,
      'create',
      null,
      item
    );

    console.log('[BossSavedItemsRepo] Created saved item:', item.id);
    return item;
  }

  async findById(id: string): Promise<BossSavedItem | null> {
    const db = await this.getDb();
    const item = await db.getFirstAsync<BossSavedItem>(
      'SELECT * FROM boss_saved_items WHERE id = ?',
      [id]
    );
    return item || null;
  }

  async findAll(filters?: {
    type?: BossSavedItemType;
    status?: BossSavedItemStatus;
    severity?: BossSavedItemSeverity;
    created_by_user_id?: string;
  }): Promise<BossSavedItem[]> {
    const db = await this.getDb();
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (filters?.type) {
      conditions.push('type = ?');
      params.push(filters.type);
    }

    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters?.severity) {
      conditions.push('severity = ?');
      params.push(filters.severity);
    }

    if (filters?.created_by_user_id) {
      conditions.push('created_by_user_id = ?');
      params.push(filters.created_by_user_id);
    }

    return await db.getAllAsync<BossSavedItem>(
      `SELECT * FROM boss_saved_items 
       WHERE ${conditions.join(' AND ')} 
       ORDER BY created_at DESC`,
      params
    );
  }

  async findAllWithDetails(filters?: {
    type?: BossSavedItemType;
    status?: BossSavedItemStatus;
    severity?: BossSavedItemSeverity;
    created_by_user_id?: string;
  }): Promise<BossSavedItemWithDetails[]> {
    const db = await this.getDb();
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (filters?.type) {
      conditions.push('bsi.type = ?');
      params.push(filters.type);
    }

    if (filters?.status) {
      conditions.push('bsi.status = ?');
      params.push(filters.status);
    }

    if (filters?.severity) {
      conditions.push('bsi.severity = ?');
      params.push(filters.severity);
    }

    if (filters?.created_by_user_id) {
      conditions.push('bsi.created_by_user_id = ?');
      params.push(filters.created_by_user_id);
    }

    return await db.getAllAsync<BossSavedItemWithDetails>(
      `SELECT 
        bsi.*,
        u.name as created_by_name
       FROM boss_saved_items bsi
       LEFT JOIN users u ON bsi.created_by_user_id = u.id
       WHERE ${conditions.join(' AND ')} 
       ORDER BY bsi.created_at DESC`,
      params
    );
  }

  async findByLinkedEntity(
    entity_type: string,
    entity_id: string
  ): Promise<BossSavedItem | null> {
    const db = await this.getDb();
    const item = await db.getFirstAsync<BossSavedItem>(
      `SELECT * FROM boss_saved_items 
       WHERE linked_entity_type = ? AND linked_entity_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [entity_type, entity_id]
    );
    return item || null;
  }

  async update(
    id: string,
    data: Partial<Omit<BossSavedItem, 'id' | 'created_at' | 'created_by_user_id'>>,
    updated_by_user_id: string
  ): Promise<void> {
    const db = await this.getDb();
    const oldItem = await this.findById(id);

    const updates: string[] = [];
    const values: any[] = [];

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && key !== 'created_by_user_id') {
        updates.push(`${key} = ?`);
        values.push(value ?? null);
      }
    });

    updates.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    await db.runAsync(
      `UPDATE boss_saved_items SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const newItem = await this.findById(id);

    await this.auditLog(
      updated_by_user_id,
      'boss_saved_item',
      id,
      'update',
      oldItem,
      newItem
    );

    console.log('[BossSavedItemsRepo] Updated saved item:', id);
  }

  async delete(id: string, deleted_by_user_id: string): Promise<void> {
    const db = await this.getDb();
    const oldItem = await this.findById(id);

    await db.runAsync('DELETE FROM boss_saved_items WHERE id = ?', [id]);

    await this.auditLog(
      deleted_by_user_id,
      'boss_saved_item',
      id,
      'delete',
      oldItem,
      null
    );

    console.log('[BossSavedItemsRepo] Deleted saved item:', id);
  }

  async countByStatus(status: BossSavedItemStatus): Promise<number> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM boss_saved_items WHERE status = ?',
      [status]
    );
    return result?.count || 0;
  }

  async countByType(type: BossSavedItemType): Promise<number> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM boss_saved_items WHERE type = ?',
      [type]
    );
    return result?.count || 0;
  }
}
