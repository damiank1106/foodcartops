import { BaseRepository } from './base';

export type SyncTableName = 'product_categories' | 'products';
export type SyncOp = 'upsert' | 'delete';

export interface SyncOutboxItem {
  id: string;
  table_name: SyncTableName;
  row_id: string;
  op: SyncOp;
  payload_json: string;
  created_at: number;
  attempts: number;
  last_error: string | null;
}

export class SyncOutboxRepository extends BaseRepository {
  async add(
    tableName: SyncTableName,
    rowId: string,
    op: SyncOp,
    payload: Record<string, any>
  ): Promise<void> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    await db.runAsync(
      `INSERT INTO sync_outbox (id, table_name, row_id, op, payload_json, created_at, attempts, last_error)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
      [id, tableName, rowId, op, JSON.stringify(payload), now]
    );

    console.log(`[SyncOutbox] Added ${op} for ${tableName}:${rowId}`);
  }

  async getPending(limit: number = 100): Promise<SyncOutboxItem[]> {
    const db = await this.getDb();
    return await db.getAllAsync<SyncOutboxItem>(
      'SELECT * FROM sync_outbox ORDER BY created_at ASC LIMIT ?',
      [limit]
    );
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync('DELETE FROM sync_outbox WHERE id = ?', [id]);
    console.log(`[SyncOutbox] Deleted outbox item:`, id);
  }

  async incrementAttempts(id: string, error: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      'UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?',
      [error, id]
    );
    console.log(`[SyncOutbox] Incremented attempts for:`, id);
  }

  async count(): Promise<number> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_outbox'
    );
    return result?.count ?? 0;
  }

  async hasPendingForRow(tableName: SyncTableName, rowId: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_outbox WHERE table_name = ? AND row_id = ?',
      [tableName, rowId]
    );
    return (result?.count ?? 0) > 0;
  }
}
