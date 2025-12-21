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
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
  }
}
