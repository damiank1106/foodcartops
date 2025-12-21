import type * as SQLite from 'expo-sqlite';
import { getDatabase } from '../database/init';

export class BaseRepository {
  protected async getDb(): Promise<SQLite.SQLiteDatabase> {
    return getDatabase();
  }

  protected generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected now(): number {
    return Date.now();
  }

  protected async auditLog(
    userId: string | undefined,
    entityType: string,
    entityId: string,
    action: string,
    oldData: any,
    newData: any
  ): Promise<void> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    await db.runAsync(
      `INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, old_data, new_data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId || null,
        entityType,
        entityId,
        action,
        oldData ? JSON.stringify(oldData) : null,
        newData ? JSON.stringify(newData) : null,
        now,
      ]
    );

    console.log('[AuditRepo] Logged action:', action, entityType, entityId);
  }
}
