import { BaseRepository } from './base';

export type LightBgIntensity = 'light' | 'medium' | 'high';
export type FoodIconsIntensity = 'light' | 'medium' | 'high';

export interface UserPreferences {
  user_id: string;
  dark_mode: number;
  light_bg_color: string | null;
  light_bg_intensity: LightBgIntensity;
  food_icons_enabled: number;
  food_icons_intensity: FoodIconsIntensity;
  last_seen_expenses_at: string | null;
  updated_at: number;
}

export class UserPreferencesRepository extends BaseRepository {
  async get(userId: string): Promise<UserPreferences | null> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<UserPreferences>(
      'SELECT * FROM user_preferences WHERE user_id = ?',
      [userId]
    );
    return result || null;
  }

  async getOrCreate(userId: string): Promise<UserPreferences> {
    const existing = await this.get(userId);
    if (existing) {
      return existing;
    }

    const defaults: UserPreferences = {
      user_id: userId,
      dark_mode: 1,
      light_bg_color: null,
      light_bg_intensity: 'medium',
      food_icons_enabled: 0,
      food_icons_intensity: 'medium',
      last_seen_expenses_at: null,
      updated_at: this.now(),
    };

    await this.upsert(defaults, userId);
    return defaults;
  }

  async upsert(prefs: Partial<UserPreferences> & { user_id: string }, actorUserId: string): Promise<void> {
    const db = await this.getDb();
    const now = this.now();

    const existing = await this.get(prefs.user_id);

    await db.runAsync(
      `INSERT OR REPLACE INTO user_preferences 
       (user_id, dark_mode, light_bg_color, light_bg_intensity, food_icons_enabled, food_icons_intensity, last_seen_expenses_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prefs.user_id,
        prefs.dark_mode ?? (existing?.dark_mode ?? 1),
        prefs.light_bg_color ?? (existing?.light_bg_color ?? null),
        prefs.light_bg_intensity ?? (existing?.light_bg_intensity ?? 'medium'),
        prefs.food_icons_enabled ?? (existing?.food_icons_enabled ?? 0),
        prefs.food_icons_intensity ?? (existing?.food_icons_intensity ?? 'medium'),
        prefs.last_seen_expenses_at ?? (existing?.last_seen_expenses_at ?? null),
        now,
      ]
    );

    await this.auditLog(
      actorUserId,
      'user_preferences',
      prefs.user_id,
      'update',
      existing,
      { ...existing, ...prefs, updated_at: now }
    );

    console.log('[UserPreferencesRepo] Upserted preferences for user:', prefs.user_id);
  }
}
