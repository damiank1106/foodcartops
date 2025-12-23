import { SavedRecord, SavedRecordType } from '../types';
import { BaseRepository } from './base';

export class SavedRecordRepository extends BaseRepository {
  async saveSnapshot(
    type: SavedRecordType,
    sourceId: string,
    payload: any,
    userId: string,
    notes?: string
  ): Promise<SavedRecord> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = Date.now();

    await db.runAsync(
      `INSERT INTO saved_records (
        id, type, source_id, payload_json, created_by_user_id, created_at, updated_at, is_deleted, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, type, sourceId, JSON.stringify(payload), userId, now, now, notes || null]
    );

    await this.auditLog(userId, 'saved_record', id, 'create', null, {
      type,
      source_id: sourceId,
    });

    console.log('[SavedRecordRepo] Snapshot saved:', { id, type, sourceId });

    return this.findById(id) as Promise<SavedRecord>;
  }

  async findById(id: string): Promise<SavedRecord | null> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<SavedRecord>(
      'SELECT * FROM saved_records WHERE id = ? AND is_deleted = 0',
      [id]
    );
    return result || null;
  }

  async listSavedByType(type: SavedRecordType): Promise<SavedRecord[]> {
    const db = await this.getDb();
    const results = await db.getAllAsync<SavedRecord>(
      'SELECT * FROM saved_records WHERE type = ? AND is_deleted = 0 ORDER BY created_at DESC',
      [type]
    );
    return results;
  }

  async listAll(): Promise<SavedRecord[]> {
    const db = await this.getDb();
    const results = await db.getAllAsync<SavedRecord>(
      'SELECT * FROM saved_records WHERE is_deleted = 0 ORDER BY created_at DESC'
    );
    return results;
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const db = await this.getDb();
    const now = Date.now();

    const old = await this.findById(id);

    await db.runAsync(
      'UPDATE saved_records SET is_deleted = 1, updated_at = ? WHERE id = ?',
      [now, id]
    );

    await this.auditLog(userId, 'saved_record', id, 'delete', old, null);

    console.log('[SavedRecordRepo] Snapshot soft-deleted:', id);
  }
}
