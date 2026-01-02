import { BaseRepository } from './base';

export type SyncOp = 'upsert' | 'delete';

export interface SyncOutboxItem {
  id: string;
  change_id: string;
  change_type: string | null;
  table_name: string;
  row_id: string;
  op: SyncOp;
  payload_json: string;
  created_at: number;
  attempts: number;
  last_error: string | null;
  sync_status: 'pending' | 'syncing' | 'failed' | 'synced';
  last_attempt_at: number | null;
  user_id: string | null;
  cart_id: string | null;
  role: string | null;
  synced_at: number | null;
}

export class SyncOutboxRepository extends BaseRepository {
  private async resolveUserId(tableName: string, payload: Record<string, any>): Promise<string | null> {
    if (tableName === 'users' && payload.id) {
      return payload.id;
    }

    const userId =
      payload.user_id ||
      payload.worker_id ||
      payload.submitted_by_user_id ||
      payload.seller_user_id ||
      payload.created_by_user_id ||
      payload.approved_by_user_id ||
      payload.rejected_by_user_id ||
      payload.reviewed_by_user_id;

    if (userId) {
      return userId;
    }

    if (tableName === 'settlement_items' && payload.settlement_id) {
      const db = await this.getDb();
      const settlement = await db.getFirstAsync<{ seller_user_id: string }>(
        'SELECT seller_user_id FROM settlements WHERE id = ?',
        [payload.settlement_id]
      );
      return settlement?.seller_user_id ?? null;
    }

    return null;
  }

  private async resolveCartId(tableName: string, payload: Record<string, any>): Promise<string | null> {
    if (payload.cart_id) {
      return payload.cart_id;
    }

    const db = await this.getDb();

    if (payload.shift_id) {
      const shift = await db.getFirstAsync<{ cart_id: string }>(
        'SELECT cart_id FROM worker_shifts WHERE id = ?',
        [payload.shift_id]
      );
      return shift?.cart_id ?? null;
    }

    if (tableName === 'settlement_items' && payload.settlement_id) {
      const settlement = await db.getFirstAsync<{ cart_id: string }>(
        'SELECT cart_id FROM settlements WHERE id = ?',
        [payload.settlement_id]
      );
      return settlement?.cart_id ?? null;
    }

    return null;
  }

  private async resolveRole(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const db = await this.getDb();
    const user = await db.getFirstAsync<{ role: string }>(
      'SELECT role FROM users WHERE id = ?',
      [userId]
    );
    return user?.role ?? null;
  }

  async add(
    tableName: string,
    rowId: string,
    op: SyncOp,
    payload: Record<string, any>,
    options?: {
      changeId?: string;
      changeType?: string;
    }
  ): Promise<void> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();
    const userId = await this.resolveUserId(tableName, payload);
    const cartId = await this.resolveCartId(tableName, payload);
    const role = await this.resolveRole(userId);
    const changeId = options?.changeId ?? id;
    const changeType = options?.changeType ?? null;

    await db.runAsync(
      `INSERT INTO sync_outbox (
        id, change_id, change_type, table_name, row_id, op, payload_json, created_at,
        attempts, last_error, sync_status, user_id, cart_id, role
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'pending', ?, ?, ?)`,
      [id, changeId, changeType, tableName, rowId, op, JSON.stringify(payload), now, userId, cartId, role]
    );

    console.log(`[SyncOutbox] Added ${op} for ${tableName}:${rowId}`);
  }

  async getPending(limit: number = 100): Promise<SyncOutboxItem[]> {
    const db = await this.getDb();
    return await db.getAllAsync<SyncOutboxItem>(
      `SELECT * FROM sync_outbox
       WHERE sync_status IN ('pending', 'failed')
       ORDER BY created_at ASC LIMIT ?`,
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
      `UPDATE sync_outbox
       SET attempts = attempts + 1, last_error = ?, sync_status = 'failed'
       WHERE id = ?`,
      [error, id]
    );
    console.log(`[SyncOutbox] Incremented attempts for:`, id);
  }

  async count(): Promise<number> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM sync_outbox
       WHERE sync_status IN ('pending', 'syncing', 'failed')`
    );
    return result?.count ?? 0;
  }

  async hasPendingForRow(tableName: string, rowId: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM sync_outbox
       WHERE table_name = ? AND row_id = ? AND sync_status IN ('pending', 'syncing', 'failed')`,
      [tableName, rowId]
    );
    return (result?.count ?? 0) > 0;
  }

  async markSyncing(id: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `UPDATE sync_outbox SET sync_status = 'syncing', last_error = NULL, last_attempt_at = ? WHERE id = ?`,
      [this.now(), id]
    );
  }

  async markSynced(id: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `UPDATE sync_outbox SET sync_status = 'synced', synced_at = ? WHERE id = ?`,
      [this.now(), id]
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `UPDATE sync_outbox
       SET sync_status = 'failed', last_error = ?, attempts = attempts + 1
       WHERE id = ?`,
      [error, id]
    );
  }

  async resetToPending(id: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `UPDATE sync_outbox
       SET sync_status = 'pending', last_error = NULL
       WHERE id = ?`,
      [id]
    );
  }

  async listByStatus(statuses: SyncOutboxItem['sync_status'][]): Promise<SyncOutboxItem[]> {
    const db = await this.getDb();
    const placeholders = statuses.map(() => '?').join(', ');
    return await db.getAllAsync<SyncOutboxItem>(
      `SELECT * FROM sync_outbox WHERE sync_status IN (${placeholders}) ORDER BY created_at ASC`,
      statuses
    );
  }
}
