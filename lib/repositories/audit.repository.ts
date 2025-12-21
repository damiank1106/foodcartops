import { BaseRepository } from './base';
import { AuditLog } from '../types';

export class AuditRepository extends BaseRepository {
  async log(data: {
    user_id?: string;
    entity_type: string;
    entity_id: string;
    action: string;
    old_data?: any;
    new_data?: any;
  }): Promise<void> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    await db.runAsync(
      `INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, old_data, new_data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.user_id || null,
        data.entity_type,
        data.entity_id,
        data.action,
        data.old_data ? JSON.stringify(data.old_data) : null,
        data.new_data ? JSON.stringify(data.new_data) : null,
        now,
      ]
    );

    console.log('[AuditRepo] Logged action:', data.action, data.entity_type, data.entity_id);
  }

  async getLogsByEntity(entity_type: string, entity_id: string): Promise<AuditLog[]> {
    const db = await this.getDb();
    return await db.getAllAsync<AuditLog>(
      'SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC',
      [entity_type, entity_id]
    );
  }

  async getLogsByUser(user_id: string): Promise<AuditLog[]> {
    const db = await this.getDb();
    return await db.getAllAsync<AuditLog>(
      'SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC',
      [user_id]
    );
  }

  async getRecentLogs(limit: number = 100): Promise<AuditLog[]> {
    const db = await this.getDb();
    return await db.getAllAsync<AuditLog>(
      'SELECT * FROM audit_logs WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
  }

  async softDeleteLog(logId: string, deletedByUserId: string): Promise<void> {
    const db = await this.getDb();
    const now = this.now();

    await db.runAsync(
      'UPDATE audit_logs SET deleted_at = ? WHERE id = ?',
      [now, logId]
    );

    await this.log({
      user_id: deletedByUserId,
      entity_type: 'audit_log',
      entity_id: logId,
      action: 'hide',
      new_data: JSON.stringify({ deleted_at: now }),
    });

    console.log('[AuditRepo] Soft-deleted log:', logId);
  }

  async clearAllLogs(deletedByUserId: string): Promise<void> {
    const db = await this.getDb();
    const now = this.now();

    const activeLogs = await db.getAllAsync<AuditLog>(
      'SELECT id FROM audit_logs WHERE deleted_at IS NULL'
    );

    await db.runAsync(
      'UPDATE audit_logs SET deleted_at = ? WHERE deleted_at IS NULL',
      [now]
    );

    await this.log({
      user_id: deletedByUserId,
      entity_type: 'audit_log',
      entity_id: 'all',
      action: 'clear_all',
      new_data: JSON.stringify({ count: activeLogs.length, deleted_at: now }),
    });

    console.log('[AuditRepo] Cleared all logs:', activeLogs.length);
  }
}
