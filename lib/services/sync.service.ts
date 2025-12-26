import * as Network from 'expo-network';
import { getSupabaseClient } from '../supabase/client';
import { getDatabase } from '../database/init';

interface SyncOutboxRow {
  id: string;
  table_name: string;
  row_id: string;
  op: 'upsert' | 'delete';
  payload_json: string;
  created_at: number;
  attempts: number;
  last_error: string | null;
}

interface SyncStateRow {
  table_name: string;
  last_sync_at: string | null;
}

let syncInProgress = false;
let syncListeners: ((status: SyncStatus) => void)[] = [];

export interface SyncStatus {
  isRunning: boolean;
  currentStep: string;
  progress: {
    total: number;
    current: number;
    table?: string;
  };
  lastError: string | null;
  lastSyncAt: string | null;
  pendingCount: number;
}

let currentStatus: SyncStatus = {
  isRunning: false,
  currentStep: 'idle',
  progress: { total: 0, current: 0 },
  lastError: null,
  lastSyncAt: null,
  pendingCount: 0,
};

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  syncListeners.push(listener);
  listener(currentStatus);
  return () => {
    syncListeners = syncListeners.filter(l => l !== listener);
  };
}

function updateStatus(updates: Partial<SyncStatus>) {
  currentStatus = { ...currentStatus, ...updates };
  syncListeners.forEach(listener => listener(currentStatus));
}

export async function getSyncStatus(): Promise<SyncStatus> {
  try {
    const db = await getDatabase();
    const pendingResult = await db.getAllAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_outbox'
    );
    const pendingCount = pendingResult[0]?.count || 0;

    const stateResult = await db.getAllAsync<SyncStateRow>(
      "SELECT last_sync_at FROM sync_state ORDER BY last_sync_at DESC LIMIT 1"
    );
    const lastSyncAt = stateResult[0]?.last_sync_at || null;

    return {
      ...currentStatus,
      pendingCount,
      lastSyncAt,
    };
  } catch (error) {
    console.error('[Sync] Error getting status:', error);
    return currentStatus;
  }
}

export async function syncNow(reason: string = 'manual'): Promise<{ success: boolean; error?: string }> {
  if (syncInProgress) {
    console.log('[Sync] Already in progress, skipping');
    return { success: false, error: 'Sync already in progress' };
  }

  console.log(`[Sync] Starting (reason=${reason})`);
  syncInProgress = true;
  updateStatus({ isRunning: true, currentStep: 'Preparing...', progress: { total: 0, current: 0 }, lastError: null });

  try {
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected || !networkState.isInternetReachable) {
      console.log('[Sync] Offline, skipping');
      updateStatus({ isRunning: false, currentStep: 'idle', lastError: 'Offline' });
      syncInProgress = false;
      return { success: false, error: 'No internet connection' };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      console.log('[Sync] Supabase not configured');
      updateStatus({ isRunning: false, currentStep: 'idle', lastError: 'Supabase not configured' });
      syncInProgress = false;
      return { success: false, error: 'Supabase not configured' };
    }

    const db = await getDatabase();
    const outboxRows = await db.getAllAsync<SyncOutboxRow>(
      'SELECT * FROM sync_outbox ORDER BY created_at ASC'
    );
    console.log(`[Sync] Pending outbox: ${outboxRows.length}`);

    updateStatus({ progress: { total: outboxRows.length, current: 0 } });

    for (let i = 0; i < outboxRows.length; i++) {
      const row = outboxRows[i];
      updateStatus({ 
        currentStep: `Pushing ${row.table_name} (${i + 1}/${outboxRows.length})`,
        progress: { total: outboxRows.length, current: i, table: row.table_name }
      });

      try {
        const payload = JSON.parse(row.payload_json);

        if (row.op === 'upsert') {
          const { error } = await supabase
            .from(row.table_name)
            .upsert(payload, { onConflict: 'id' });

          if (error) {
            throw error;
          }

          console.log(`[Sync] Pushed ${row.table_name} upsert: ${row.row_id}`);
        } else {
          const now = new Date().toISOString();
          const { error } = await supabase
            .from(row.table_name)
            .update({ deleted_at: now, updated_at_iso: now })
            .eq('id', row.row_id);

          if (error) {
            throw error;
          }

          console.log(`[Sync] Pushed ${row.table_name} delete: ${row.row_id}`);
        }

        await db.runAsync('DELETE FROM sync_outbox WHERE id = ?', [row.id]);
      } catch (error: any) {
        console.error(`[Sync] Failed to push ${row.table_name}:`, error);
        await db.runAsync(
          'UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?',
          [error.message || String(error), row.id]
        );
      }
    }

    updateStatus({ currentStep: 'Pulling updates...' });

    const tables = ['product_categories', 'products'];
    for (const tableName of tables) {
      try {
        const stateRows = await db.getAllAsync<SyncStateRow>(
          'SELECT last_sync_at FROM sync_state WHERE table_name = ?',
          [tableName]
        );
        const lastSyncAt = stateRows[0]?.last_sync_at || '1970-01-01T00:00:00Z';

        console.log(`[Sync] Pulling ${tableName} since ${lastSyncAt}`);

        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .gt('updated_at_iso', lastSyncAt);

        if (error) {
          throw error;
        }

        if (data && data.length > 0) {
          console.log(`[Sync] Received ${data.length} ${tableName} rows`);

          updateStatus({ currentStep: `Applying ${tableName} updates...` });

          for (const remoteRow of data) {
            const pendingChanges = await db.getAllAsync<SyncOutboxRow>(
              'SELECT id FROM sync_outbox WHERE table_name = ? AND row_id = ?',
              [tableName, remoteRow.id]
            );

            if (pendingChanges.length > 0) {
              console.log(`[Sync] Skip ${tableName} ${remoteRow.id} - local changes pending`);
              continue;
            }

            const columns = Object.keys(remoteRow);
            const placeholders = columns.map(() => '?').join(', ');

            const insertSQL = `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
            const values = columns.map(col => remoteRow[col]);

            await db.runAsync(insertSQL, values);
          }
        }

        const now = new Date().toISOString();
        await db.runAsync(
          'UPDATE sync_state SET last_sync_at = ? WHERE table_name = ?',
          [now, tableName]
        );
      } catch (error: any) {
        console.error(`[Sync] Failed to pull ${tableName}:`, error);
        updateStatus({ lastError: error.message || String(error) });
      }
    }

    console.log('[Sync] Completed');
    const status = await getSyncStatus();
    updateStatus({ 
      isRunning: false, 
      currentStep: 'Completed ✅',
      lastSyncAt: new Date().toISOString(),
      pendingCount: status.pendingCount
    });

    syncInProgress = false;
    return { success: true };
  } catch (error: any) {
    console.error('[Sync] Error:', error);
    updateStatus({ 
      isRunning: false, 
      currentStep: 'idle', 
      lastError: error.message || String(error) 
    });
    syncInProgress = false;
    return { success: false, error: error.message || String(error) };
  }
}

export async function clearOutbox(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM sync_outbox');
    console.log('[Sync] Outbox cleared');
  } catch (error) {
    console.error('[Sync] Error clearing outbox:', error);
  }
}
