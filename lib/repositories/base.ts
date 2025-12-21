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
}
