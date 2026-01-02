import { BaseRepository } from './base';

export interface DailyOverride {
  date_key: string;
  is_reset: number;
  created_at: number;
  updated_at: number;
}

export class DailyOverrideRepository extends BaseRepository {
  async getOverride(dateKey: string): Promise<DailyOverride | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<DailyOverride>(
      'SELECT * FROM daily_overrides WHERE date_key = ?',
      [dateKey]
    );

    return row || null;
  }

  async setReset(dateKey: string, isReset: boolean): Promise<void> {
    const db = await this.getDb();
    const now = this.now();
    const resetValue = isReset ? 1 : 0;

    await db.runAsync(
      `INSERT INTO daily_overrides (date_key, is_reset, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date_key) DO UPDATE SET is_reset = excluded.is_reset, updated_at = excluded.updated_at`,
      [dateKey, resetValue, now, now]
    );
  }
}
