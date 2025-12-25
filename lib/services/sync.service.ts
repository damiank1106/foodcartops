import * as Network from 'expo-network';
import { getSupabaseClient, isSyncEnabled } from '../supabase/client';
import { SyncOutboxRepository, SyncTableName } from '../repositories/sync-outbox.repository';
import { BaseRepository } from '../repositories/base';

let isSyncing = false;
let lastSyncError: string | null = null;

export class SyncService extends BaseRepository {
  private outboxRepo = new SyncOutboxRepository();

  async syncNow(): Promise<void> {
    if (isSyncing) {
      console.log('[Sync] Already syncing, skipping');
      return;
    }

    if (!isSyncEnabled()) {
      console.log('[Sync] Sync is disabled (no Supabase credentials)');
      return;
    }

    try {
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected || !networkState.isInternetReachable) {
        console.log('[Sync] No internet connection, skipping sync');
        return;
      }
    } catch (error) {
      console.warn('[Sync] Could not check network state:', error);
    }

    isSyncing = true;
    console.log('[Sync] Starting sync...');

    try {
      await this.pushChanges();
      await this.pullChanges();
      lastSyncError = null;
      console.log('[Sync] Sync completed successfully');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      lastSyncError = errorMsg;
      console.error('[Sync] Sync failed:', errorMsg);
    } finally {
      isSyncing = false;
    }
  }

  private async pushChanges(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const pending = await this.outboxRepo.getPending(50);
    console.log(`[Sync] Pushing ${pending.length} pending changes`);

    for (const item of pending) {
      try {
        const payload = JSON.parse(item.payload_json);

        if (item.op === 'upsert') {
          const { error } = await supabase
            .from(item.table_name)
            .upsert(payload, { onConflict: 'id' });

          if (error) {
            throw new Error(error.message);
          }
        } else if (item.op === 'delete') {
          const { error } = await supabase
            .from(item.table_name)
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', item.row_id);

          if (error) {
            throw new Error(error.message);
          }
        }

        await this.outboxRepo.delete(item.id);
        console.log(`[Sync] Pushed ${item.op} for ${item.table_name}:${item.row_id}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Sync] Failed to push ${item.table_name}:${item.row_id}:`, errorMsg);
        await this.outboxRepo.incrementAttempts(item.id, errorMsg);
      }
    }
  }

  private async pullChanges(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const tables: SyncTableName[] = ['product_categories', 'products'];

    for (const tableName of tables) {
      try {
        const lastSyncAt = await this.getLastSyncAt(tableName);
        console.log(`[Sync] Pulling ${tableName} since ${lastSyncAt || 'beginning'}`);

        let query = supabase.from(tableName).select('*');

        if (lastSyncAt) {
          query = query.gt('updated_at_iso', lastSyncAt);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(error.message);
        }

        if (data && data.length > 0) {
          console.log(`[Sync] Pulled ${data.length} rows from ${tableName}`);
          await this.applyPulledData(tableName, data);
        }

        await this.updateLastSyncAt(tableName, new Date().toISOString());
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Sync] Failed to pull ${tableName}:`, errorMsg);
      }
    }
  }

  private async applyPulledData(tableName: SyncTableName, rows: any[]): Promise<void> {
    const db = await this.getDb();

    for (const row of rows) {
      const hasPending = await this.outboxRepo.hasPendingForRow(tableName, row.id);
      if (hasPending) {
        console.log(`[Sync] Skipping ${tableName}:${row.id} (local changes pending)`);
        continue;
      }

      try {
        if (tableName === 'product_categories') {
          await this.upsertCategory(db, row);
        } else if (tableName === 'products') {
          await this.upsertProduct(db, row);
        }
      } catch (error) {
        console.error(`[Sync] Failed to apply ${tableName}:${row.id}:`, error);
      }
    }
  }

  private async upsertCategory(db: any, row: any): Promise<void> {
    await db.runAsync(
      `INSERT INTO product_categories 
       (id, name, sort_order, is_active, created_at, updated_at, business_id, device_id, deleted_at, created_at_iso, updated_at_iso)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         sort_order = excluded.sort_order,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at,
         business_id = excluded.business_id,
         device_id = excluded.device_id,
         deleted_at = excluded.deleted_at,
         updated_at_iso = excluded.updated_at_iso`,
      [
        row.id,
        row.name,
        row.sort_order ?? 0,
        row.deleted_at ? 0 : (row.is_active ?? 1),
        this.parseTimestamp(row.created_at_iso),
        this.parseTimestamp(row.updated_at_iso),
        row.business_id,
        row.device_id,
        row.deleted_at,
        row.created_at_iso,
        row.updated_at_iso,
      ]
    );
  }

  private async upsertProduct(db: any, row: any): Promise<void> {
    await db.runAsync(
      `INSERT INTO products 
       (id, category_id, name, description, price, price_cents, cost_cents, sku, icon_image_uri, category, is_active, created_at, updated_at, business_id, device_id, deleted_at, created_at_iso, updated_at_iso)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         category_id = excluded.category_id,
         name = excluded.name,
         description = excluded.description,
         price = excluded.price,
         price_cents = excluded.price_cents,
         cost_cents = excluded.cost_cents,
         sku = excluded.sku,
         icon_image_uri = excluded.icon_image_uri,
         category = excluded.category,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at,
         business_id = excluded.business_id,
         device_id = excluded.device_id,
         deleted_at = excluded.deleted_at,
         updated_at_iso = excluded.updated_at_iso`,
      [
        row.id,
        row.category_id,
        row.name,
        row.description,
        row.price ?? 0,
        row.price_cents ?? 0,
        row.cost_cents,
        row.sku,
        row.icon_image_uri,
        row.category,
        row.deleted_at ? 0 : (row.is_active ?? 1),
        this.parseTimestamp(row.created_at_iso),
        this.parseTimestamp(row.updated_at_iso),
        row.business_id,
        row.device_id,
        row.deleted_at,
        row.created_at_iso,
        row.updated_at_iso,
      ]
    );
  }

  private parseTimestamp(isoString: string | undefined | null): number {
    if (!isoString) return Date.now();
    try {
      return new Date(isoString).getTime();
    } catch {
      return Date.now();
    }
  }

  private async getLastSyncAt(tableName: SyncTableName): Promise<string | null> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ last_sync_at: string | null }>(
      'SELECT last_sync_at FROM sync_state WHERE table_name = ?',
      [tableName]
    );
    return result?.last_sync_at || null;
  }

  private async updateLastSyncAt(tableName: SyncTableName, timestamp: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      'UPDATE sync_state SET last_sync_at = ? WHERE table_name = ?',
      [timestamp, tableName]
    );
  }

  async getSyncStatus(): Promise<{
    lastSync: string | null;
    pendingCount: number;
    lastError: string | null;
    isSyncing: boolean;
  }> {
    const pendingCount = await this.outboxRepo.count();
    const lastSync = await this.getLastSyncAt('product_categories');
    
    return {
      lastSync,
      pendingCount,
      lastError: lastSyncError,
      isSyncing,
    };
  }
}

export const syncService = new SyncService();
