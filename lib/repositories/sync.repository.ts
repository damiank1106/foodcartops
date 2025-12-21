import { BaseRepository } from './base';
import { SyncQueueItem, SyncAction } from '../types';

export class SyncRepository extends BaseRepository {
  async enqueue(data: {
    entity_type: string;
    entity_id: string;
    action: SyncAction;
    payload: any;
  }): Promise<void> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    await db.runAsync(
      `INSERT INTO sync_queue (id, entity_type, entity_id, action, payload, attempts, status, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 'pending', ?)`,
      [id, data.entity_type, data.entity_id, data.action, JSON.stringify(data.payload), now]
    );

    console.log('[SyncRepo] Enqueued:', data.action, data.entity_type, data.entity_id);
  }

  async getPendingItems(limit: number = 10): Promise<SyncQueueItem[]> {
    const db = await this.getDb();
    return await db.getAllAsync<SyncQueueItem>(
      `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
      [limit]
    );
  }

  async markSyncing(id: string): Promise<void> {
    const db = await this.getDb();
    const now = this.now();

    await db.runAsync(
      `UPDATE sync_queue SET status = 'syncing', last_attempt = ? WHERE id = ?`,
      [now, id]
    );
  }

  async markSynced(id: string): Promise<void> {
    const db = await this.getDb();

    await db.runAsync(
      `UPDATE sync_queue SET status = 'synced' WHERE id = ?`,
      [id]
    );

    console.log('[SyncRepo] Marked as synced:', id);
  }

  async markFailed(id: string, error: string): Promise<void> {
    const db = await this.getDb();
    const now = this.now();

    await db.runAsync(
      `UPDATE sync_queue SET status = 'failed', error = ?, attempts = attempts + 1, last_attempt = ? WHERE id = ?`,
      [error, now, id]
    );

    console.log('[SyncRepo] Marked as failed:', id, error);
  }

  async getPendingCount(): Promise<number> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'`
    );
    return result?.count || 0;
  }
}
