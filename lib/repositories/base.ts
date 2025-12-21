import type * as SQLite from 'expo-sqlite';
import { getDatabase } from '../database/init';
import { AuditRepository } from './audit.repository';

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
    const auditRepo = new AuditRepository();
    await auditRepo.log({
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      old_data: oldData,
      new_data: newData,
    });
  }
}
