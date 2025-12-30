import * as Network from 'expo-network';
import { initSupabaseClient } from '../supabase/client';
import { getDatabase } from '../database/init';
import { ensureSystemUsers } from '../utils/seed';

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
let syncCompletionCallbacks: (() => void)[] = [];

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

function stripLocalOnlyColumns(tableName: string, payload: any): any {
  const localOnlyColumns: Record<string, string[]> = {
    inventory_items: ['storage_group'],
    users: ['email', 'password_hash', 'profile_image_uri'],
  };

  const columnsToStrip = localOnlyColumns[tableName] || [];
  if (columnsToStrip.length === 0) {
    return payload;
  }

  const cleaned = { ...payload };
  columnsToStrip.forEach(col => {
    delete cleaned[col];
  });

  return cleaned;
}

function normalizeUserRole(role: string): string | null {
  const roleMap: Record<string, string> = {
    'boss': 'general_manager',
    'boss2': 'developer',
    'worker': 'operation_manager',
    'inventory_clerk': 'inventory_clerk',
    'developer': 'developer',
    'general_manager': 'general_manager',
    'operation_manager': 'operation_manager',
  };

  const normalized = roleMap[role];
  if (!normalized) {
    console.warn(`[Sync] Unknown role "${role}" - skipping user`);
    return null;
  }

  return normalized;
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

export function onSyncComplete(callback: () => void): () => void {
  syncCompletionCallbacks.push(callback);
  return () => {
    syncCompletionCallbacks = syncCompletionCallbacks.filter(cb => cb !== callback);
  };
}

function notifySyncComplete() {
  console.log(`[Sync] Notifying ${syncCompletionCallbacks.length} completion callbacks`);
  syncCompletionCallbacks.forEach(callback => {
    try {
      callback();
    } catch (error) {
      console.error('[Sync] Error in completion callback:', error);
    }
  });
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

    const supabase = await initSupabaseClient();
    if (!supabase) {
      console.log('[Sync] Supabase not configured');
      updateStatus({ isRunning: false, currentStep: 'idle', lastError: 'Supabase not configured' });
      syncInProgress = false;
      return { success: false, error: 'Supabase not configured' };
    }

    let db = await getDatabase();
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
        const syncPayload = stripLocalOnlyColumns(row.table_name, payload);

        if (row.table_name === 'inventory_items') {
          console.log('[Sync] inventory_items payload keys:', Object.keys(syncPayload));
          console.log(`[Sync] DEBUG inventory_items payload for ${row.row_id}:`, {
            current_qty: syncPayload.current_qty,
            reorder_level_qty: syncPayload.reorder_level_qty,
            name: syncPayload.name
          });
        }

        if (row.table_name === 'users') {
          console.log('[Sync] users payload keys:', Object.keys(syncPayload));
        }

        if (row.op === 'upsert') {
          const { error } = await supabase
            .from(row.table_name)
            .upsert(syncPayload, { onConflict: 'id' });

          if (error) {
            throw error;
          }

          console.log(`[Sync] Pushed ${row.table_name} upsert: ${row.row_id}`);

          if (row.table_name === 'inventory_items') {
            const { data: verifyData, error: verifyError } = await supabase
              .from(row.table_name)
              .select('id, name, current_qty, reorder_level_qty')
              .eq('id', row.row_id)
              .single();
            
            if (!verifyError && verifyData) {
              console.log(`[Sync] DEBUG Supabase returned for ${row.row_id}:`, verifyData);
            }
          }
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

        db = await getDatabase();
        await db.runAsync('DELETE FROM sync_outbox WHERE id = ?', [row.id]);
      } catch (error: any) {
        console.error(`[Sync] Failed to push ${row.table_name}:`, error);
        const errorMsg = error.message || String(error);
        
        if (errorMsg.toLowerCase().includes('invalid api key')) {
          console.error('[Sync] Invalid API key detected - stopping sync');
          db = await getDatabase();
          await db.runAsync(
            'UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?',
            [errorMsg, row.id]
          );
          await db.runAsync(
            'UPDATE sync_state SET last_error = ? WHERE table_name = ?',
            ['Invalid API key. Please check your credentials.', row.table_name]
          );
          updateStatus({ 
            isRunning: false, 
            currentStep: 'idle', 
            lastError: 'Invalid API key. Please check your credentials.' 
          });
          syncInProgress = false;
          return { success: false, error: 'Invalid API key. Please check your credentials.' };
        }
        
        db = await getDatabase();
        await db.runAsync(
          'UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?',
          [errorMsg, row.id]
        );
      }
    }

    updateStatus({ currentStep: 'Pulling updates...' });

    const tables = [
      'users',
      'product_categories',
      'products',
      'carts',
      'inventory_storage_groups',
      'inventory_items'
    ];

    // TODO PHASE 8.XX-C: Add next sync batch tables
    // - worker_shifts
    // - sales
    // - sale_items
    // - payments
    // - expenses
    // - settlements
    // Ensure Supabase tables exist with matching schema before adding to sync
    for (const tableName of tables) {
      try {
        db = await getDatabase();
        const stateRows = await db.getAllAsync<SyncStateRow>(
          'SELECT last_sync_at FROM sync_state WHERE table_name = ?',
          [tableName]
        );
        const lastSyncAt = stateRows[0]?.last_sync_at || '1970-01-01T00:00:00Z';

        console.log(`[Sync] Pulling ${tableName} since ${lastSyncAt}`);

        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .gte('updated_at_iso', lastSyncAt)
          .order('updated_at_iso', { ascending: true });

        if (error) {
          throw error;
        }

        if (data && data.length > 0) {
          console.log(`[Sync] Received ${data.length} ${tableName} rows`);

          updateStatus({ currentStep: `Applying ${tableName} updates...` });

          let maxUpdatedAt = lastSyncAt;

          for (const remoteRow of data) {
            db = await getDatabase();
            const pendingChanges = await db.getAllAsync<SyncOutboxRow>(
              'SELECT id FROM sync_outbox WHERE table_name = ? AND row_id = ?',
              [tableName, remoteRow.id]
            );

            if (pendingChanges.length > 0) {
              console.log(`[Sync] Skip ${tableName} ${remoteRow.id} - local changes pending`);
              continue;
            }

            if (remoteRow.deleted_at) {
              console.log(`[Sync] Tombstone detected for ${tableName} ${remoteRow.id}, marking as deleted`);
              await db.runAsync(
                `UPDATE ${tableName} SET deleted_at = ?, is_active = 0, updated_at = ? WHERE id = ?`,
                [remoteRow.deleted_at, Date.now(), remoteRow.id]
              );
            } else {
              const localSchema = await db.getAllAsync<{ name: string }>(
                `PRAGMA table_info(${tableName})`
              );
              const localColumns = new Set(localSchema.map(col => col.name));

              const columns = Object.keys(remoteRow).filter(col => localColumns.has(col));
              const placeholders = columns.map(() => '?').join(', ');

              if (tableName === 'users') {
                const normalizedRole = normalizeUserRole(remoteRow.role);
                if (!normalizedRole) {
                  console.warn(`[Sync] Skipping user ${remoteRow.id} with unknown role: ${remoteRow.role}`);
                  continue;
                }

                remoteRow.role = normalizedRole;

                const localUser = await db.getFirstAsync<any>(
                  'SELECT id, role, pin_hash, pin_hash_alg, is_system FROM users WHERE id = ?',
                  [remoteRow.id]
                );

                if (localUser && localUser.is_system) {
                  console.log(`[Sync] Protecting system user ${localUser.role} pin_hash`);
                  
                  if (!remoteRow.pin_hash && localUser.pin_hash) {
                    console.log(`[Sync] Remote has empty pin_hash for ${localUser.role}, keeping local`);
                    remoteRow.pin_hash = localUser.pin_hash;
                    remoteRow.pin_hash_alg = localUser.pin_hash_alg;
                  }
                }

                console.log(`[Sync] DEBUG Pulling user ${remoteRow.id}:`, {
                  role: remoteRow.role,
                  has_pin_hash: !!remoteRow.pin_hash,
                  pin_hash_alg: remoteRow.pin_hash_alg
                });
              }

              if (tableName === 'inventory_items') {
                console.log(`[Sync] DEBUG Pulling inventory_items ${remoteRow.id}:`, {
                  current_qty: remoteRow.current_qty,
                  reorder_level_qty: remoteRow.reorder_level_qty,
                  name: remoteRow.name
                });
              }

              const insertSQL = `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
              const values = columns.map(col => remoteRow[col]);

              await db.runAsync(insertSQL, values);
            }

            if (remoteRow.updated_at_iso && remoteRow.updated_at_iso > maxUpdatedAt) {
              maxUpdatedAt = remoteRow.updated_at_iso;
            }
          }

          db = await getDatabase();
          await db.runAsync(
            'UPDATE sync_state SET last_sync_at = ? WHERE table_name = ?',
            [maxUpdatedAt, tableName]
          );
          console.log(`[Sync] Updated last_sync_at for ${tableName} to ${maxUpdatedAt}`);

          if (tableName === 'users') {
            console.log('[Sync] Ensuring system users after pull...');
            await ensureSystemUsers();
          }
        } else {
          console.log(`[Sync] No new ${tableName} rows since ${lastSyncAt}`);
        }
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

    notifySyncComplete();

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
