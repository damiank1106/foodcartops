import * as Network from 'expo-network';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { initSupabaseClient } from '../supabase/client';
import { getDatabase } from '../database/init';
import { ensureSystemUsers } from '../utils/seed';
import { SYSTEM_USERS, SYSTEM_USER_ID_SET } from '../utils/system-users';
import { UserRepository } from '../repositories';

interface SyncOutboxRow {
  id: string;
  change_id: string | null;
  table_name: string;
  row_id: string;
  op: 'upsert' | 'delete';
  payload_json: string;
  created_at: number;
  attempts: number;
  last_error: string | null;
  sync_status: 'pending' | 'syncing' | 'failed' | 'synced';
  last_attempt_at: number | null;
  user_id: string | null;
  cart_id: string | null;
  role: string | null;
  synced_at: number | null;
}

interface SyncStateRow {
  table_name: string;
  last_sync_at: string | null;
}

let syncInProgress = false;
let syncListeners: ((status: SyncStatus) => void)[] = [];
let syncCompletionCallbacks: (() => void)[] = [];

const AUTH_STORAGE_KEY = 'foodcartops_auth';

interface SyncUserContext {
  userId: string;
  role: string;
  businessId: string;
}

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
    users: ['email', 'password_hash', 'profile_image_uri', 'pin_hash_alg'],
    carts: ['created_by_user_id'],
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

function isPlainFourDigitPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
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

async function getCurrentUserContext(): Promise<SyncUserContext | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    const authData = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
    if (!authData) return null;
    const parsed = JSON.parse(authData);
    if (!parsed?.userId) return null;

    const userRepo = new UserRepository();
    const user = await userRepo.findById(parsed.userId);
    if (!user) return null;

    return {
      userId: user.id,
      role: user.role,
      businessId: user.business_id ?? 'default_business',
    };
  } catch (error) {
    console.warn('[Sync] Failed to load current user context:', error);
    return null;
  }
}

const RECEIPT_BUCKET = 'expense-receipts';
const RETRYABLE_ERROR_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /fetch failed/i,
  /timeout/i,
  /timed out/i,
  /dns/i,
  /connection/i,
  /socket/i,
  /ecconnreset/i,
  /econnreset/i,
  /econnrefused/i,
  /enotfound/i,
  /temporary/i,
];
const MAX_RETRY_BACKOFF_MS = 5 * 60 * 1000;
const BASE_RETRY_BACKOFF_MS = 2000;

function isLocalFileUri(uri?: string | null): boolean {
  if (!uri) return false;
  return !uri.startsWith('http://') && !uri.startsWith('https://');
}

function coerceMsTimestamp(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 1e12) {
      return value * 1000;
    }
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function ensureIsoTimestamp(value?: string | null, fallbackMs?: number | null): string | null {
  if (value && typeof value === 'string') {
    return value;
  }
  if (fallbackMs !== null && fallbackMs !== undefined) {
    return new Date(fallbackMs).toISOString();
  }
  return null;
}

function parseLastSyncAt(value?: string | null): number {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getReceiptStoragePath(expenseRow: Record<string, any>): string | null {
  if (expenseRow.receipt_storage_path) return expenseRow.receipt_storage_path;
  const receiptUri = expenseRow.receipt_image_uri;
  if (typeof receiptUri === 'string' && !receiptUri.startsWith('http://') && !receiptUri.startsWith('https://')) {
    return receiptUri;
  }
  return null;
}

function getErrorStatus(error: any): number | null {
  const status = error?.status ?? error?.statusCode ?? error?.code;
  if (typeof status === 'number') {
    return status;
  }
  if (typeof status === 'string') {
    const parsed = Number(status);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRetryableError(error: any): boolean {
  if (error?.isRetryable === true) {
    return true;
  }
  const status = getErrorStatus(error);
  if (status !== null) {
    if (status >= 500) return true;
    if (status === 408 || status === 429) return true;
    if (status >= 400 && status < 500) return false;
  }
  const message = (error?.message || String(error || '')).toLowerCase();
  return RETRYABLE_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

function isPermanentError(error: any): boolean {
  const status = getErrorStatus(error);
  if (status !== null) {
    return status >= 400 && status < 500 && status !== 408 && status !== 429;
  }
  const message = (error?.message || String(error || '')).toLowerCase();
  return message.includes('unauthorized') || message.includes('forbidden') || message.includes('permission');
}

function getRetryBackoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  const exponent = Math.max(0, attempts - 1);
  return Math.min(MAX_RETRY_BACKOFF_MS, BASE_RETRY_BACKOFF_MS * Math.pow(2, exponent));
}

function formatRetryDelay(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m`;
}

function isPermanentErrorMessage(message?: string | null): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes('authentication required') ||
    normalized.includes('permission denied') ||
    normalized.includes('invalid api key') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden')
  );
}

class RetryableSyncError extends Error {
  isRetryable = true;

  constructor(message: string) {
    super(message);
    this.name = 'RetryableSyncError';
  }
}

async function getPendingCount(db: Awaited<ReturnType<typeof getDatabase>>): Promise<number> {
  const pendingRows = await db.getAllAsync<SyncOutboxRow>(
    `SELECT * FROM sync_outbox WHERE sync_status IN ('pending', 'syncing', 'failed')`
  );

  let extraReceiptCount = 0;
  for (const row of pendingRows) {
    if (row.table_name !== 'expenses') continue;
    try {
      const payload = JSON.parse(row.payload_json);
      if (typeof payload.receipt_image_uri === 'string' && isLocalFileUri(payload.receipt_image_uri)) {
        extraReceiptCount += 1;
      }
    } catch (error) {
      console.warn('[Sync] Failed to parse pending payload for receipt count', error);
    }
  }

  return pendingRows.length + extraReceiptCount;
}

async function uploadReceiptIfNeeded(
  supabase: Awaited<ReturnType<typeof initSupabaseClient>>,
  db: Awaited<ReturnType<typeof getDatabase>>,
  expenseId: string,
  payload: Record<string, any>
): Promise<Record<string, any>> {
  const receiptUri = payload.receipt_image_uri;
  if (!isLocalFileUri(receiptUri)) {
    return payload;
  }

  const networkState = await Network.getNetworkStateAsync();
  if (!networkState.isConnected || !networkState.isInternetReachable) {
    throw new RetryableSyncError('Waiting for internet');
  }

  const fileName = receiptUri.split('/').pop() || `${expenseId}.jpg`;
  const storagePath = `expenses/${expenseId}/${fileName}`;

  const fileResponse = await fetch(receiptUri);
  const fileBlob = await fileResponse.blob();
  const contentType = fileResponse.headers.get('content-type') || 'image/jpeg';

  const { error: uploadError } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(storagePath, fileBlob, { upsert: true, contentType });

  if (uploadError) {
    throw new Error(`Receipt upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(storagePath);
  const publicUrl = data.publicUrl;

  const now = Date.now();
  const nowISO = new Date().toISOString();
  await db.runAsync(
    `UPDATE expenses SET receipt_image_uri = ?, receipt_storage_path = ?, updated_at = ?, updated_at_iso = ? WHERE id = ?`,
    [publicUrl, storagePath, now, nowISO, expenseId]
  );

  return { ...payload, receipt_image_uri: publicUrl, receipt_storage_path: storagePath };
}

async function resolveReceiptUrl(
  supabase: Awaited<ReturnType<typeof initSupabaseClient>>,
  storagePath: string | null
): Promise<string | null> {
  if (!storagePath) return null;

  const signed = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (!signed.error && signed.data?.signedUrl) {
    return signed.data.signedUrl;
  }

  const { data } = supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl || null;
}

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
    const pendingCount = await getPendingCount(db);

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

export async function syncNow(reason: string = 'manual'): Promise<{ success: boolean; didWork: boolean; error?: string }> {
  if (syncInProgress) {
    console.log('[Sync] Already in progress, skipping');
    return { success: false, didWork: false, error: 'Sync already in progress' };
  }

  console.log(`[Sync] Starting (reason=${reason})`);
  syncInProgress = true;
  let didWork = false;
  updateStatus({ isRunning: true, currentStep: 'Preparing...', progress: { total: 0, current: 0 }, lastError: null });

  try {
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected || !networkState.isInternetReachable) {
      console.log('[Sync] Offline, skipping');
      const db = await getDatabase();
      const pendingCount = await getPendingCount(db);
      updateStatus({ isRunning: false, currentStep: 'idle', lastError: 'Offline', pendingCount });
      syncInProgress = false;
      return { success: false, didWork: false, error: 'No internet connection' };
    }

    const supabase = await initSupabaseClient();
    if (!supabase) {
      console.log('[Sync] Supabase not configured');
      const db = await getDatabase();
      const pendingCount = await getPendingCount(db);
      updateStatus({ isRunning: false, currentStep: 'idle', lastError: 'Supabase not configured', pendingCount });
      syncInProgress = false;
      return { success: false, didWork: false, error: 'Supabase not configured' };
    }

    const currentUserContext = await getCurrentUserContext();
    const isManagerRole = currentUserContext?.role === 'general_manager' || currentUserContext?.role === 'developer';

    let db = await getDatabase();
    const outboxRows = await db.getAllAsync<SyncOutboxRow>(
      `SELECT * FROM sync_outbox
       WHERE sync_status IN ('pending', 'failed')
       ORDER BY created_at ASC`
    );
    console.log(`[Sync] Pending outbox: ${outboxRows.length}`);

    const sortedOutbox = outboxRows.sort((a, b) => {
      const order = [
        'inventory_storage_groups',
        'inventory_items',
      ];
      const aIndex = order.indexOf(a.table_name);
      const bIndex = order.indexOf(b.table_name);
      
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return 0;
    });

    updateStatus({ progress: { total: sortedOutbox.length, current: 0 } });

    for (let i = 0; i < sortedOutbox.length; i++) {
      const row = sortedOutbox[i];
      if (row.sync_status === 'failed' && isPermanentErrorMessage(row.last_error)) {
        continue;
      }
      const backoffMs = getRetryBackoffMs(row.attempts);
      if (row.last_attempt_at && backoffMs > 0) {
        const nextAttemptAt = row.last_attempt_at + backoffMs;
        if (Date.now() < nextAttemptAt) {
          continue;
        }
      }
      didWork = true;
      const attemptStartedAt = Date.now();
      await db.runAsync(
        `UPDATE sync_outbox SET sync_status = 'syncing', last_error = NULL, last_attempt_at = ? WHERE id = ?`,
        [attemptStartedAt, row.id]
      );
      updateStatus({ 
        currentStep: `Pushing ${row.table_name} (${i + 1}/${sortedOutbox.length})`,
        progress: { total: sortedOutbox.length, current: i, table: row.table_name }
      });

      try {
        let payload = JSON.parse(row.payload_json);
        
        if (row.table_name === 'settlements' || row.table_name === 'settlement_items') {
          if (!payload.created_at || !payload.updated_at || !payload.created_at_iso || !payload.updated_at_iso) {
            console.warn(`[Sync] ${row.table_name} ${row.row_id} missing timestamps, setting now`);
            const now = Date.now();
            const nowISO = new Date().toISOString();
            payload.created_at = payload.created_at || now;
            payload.updated_at = payload.updated_at || now;
            payload.created_at_iso = payload.created_at_iso || nowISO;
            payload.updated_at_iso = payload.updated_at_iso || nowISO;
            
            db = await getDatabase();
            await db.runAsync(
              `UPDATE ${row.table_name} SET created_at = ?, updated_at = ?, created_at_iso = ?, updated_at_iso = ? WHERE id = ?`,
              [now, now, nowISO, nowISO, row.row_id]
            );
          }
        }
        
        if (row.table_name === 'expenses') {
          payload = await uploadReceiptIfNeeded(supabase, db, row.row_id, payload);
        }

        const syncPayload = stripLocalOnlyColumns(row.table_name, payload);

        if (row.table_name === 'settlements') {
          const hasAllZeroTotals = [
            syncPayload.total_cents,
            syncPayload.gross_sales_cents,
            syncPayload.cash_cents,
            syncPayload.gcash_cents,
            syncPayload.card_cents,
          ].every((value) => !value || value === 0);

          if (hasAllZeroTotals && syncPayload.shift_id) {
            const salesCount = await db.getFirstAsync<{ count: number }>(
              'SELECT COUNT(*) as count FROM sales WHERE shift_id = ? AND voided_at IS NULL',
              [syncPayload.shift_id]
            );

            if ((salesCount?.count || 0) > 0) {
              const { SettlementRepository } = await import('../repositories/settlement.repository');
              const settlementRepo = new SettlementRepository();
              const summary = await settlementRepo.computeSettlementSummary(syncPayload.shift_id);

              if (summary.total_sales_count > 0) {
                console.warn('[Sync] Settlement totals were zero despite sales. Recomputing from local DB.', {
                  settlement_id: syncPayload.id,
                  shift_id: syncPayload.shift_id,
                  sales_count: summary.total_sales_count,
                });

                const now = Date.now();
                const nowISO = new Date().toISOString();

                syncPayload.cash_cents = summary.payment_totals.CASH;
                syncPayload.gcash_cents = summary.payment_totals.GCASH;
                syncPayload.card_cents = summary.payment_totals.CARD;
                syncPayload.gross_sales_cents = summary.total_revenue_cents;
                syncPayload.total_cents = summary.total_revenue_cents;
                syncPayload.updated_at = now;
                syncPayload.updated_at_iso = nowISO;

                await db.runAsync(
                  `UPDATE settlements
                   SET cash_cents = ?, gcash_cents = ?, card_cents = ?, gross_sales_cents = ?, total_cents = ?, updated_at = ?, updated_at_iso = ?
                   WHERE id = ?`,
                  [
                    syncPayload.cash_cents,
                    syncPayload.gcash_cents,
                    syncPayload.card_cents,
                    syncPayload.gross_sales_cents,
                    syncPayload.total_cents,
                    now,
                    nowISO,
                    row.row_id,
                  ]
                );

                await db.runAsync(
                  'UPDATE sync_outbox SET payload_json = ? WHERE id = ?',
                  [JSON.stringify({ ...payload, ...syncPayload }), row.id]
                );
              }
            }
          }

          console.log('[Sync] ✅ Pushing settlements:', row.row_id);
          console.log('[Sync] settlements payload:', {
            id: syncPayload.id,
            shift_id: syncPayload.shift_id,
            status: syncPayload.status,
            total_cents: syncPayload.total_cents,
            keys: Object.keys(syncPayload)
          });
        }

        if (row.table_name === 'settlement_items') {
          if (syncPayload.product_id === undefined) {
            console.log(`[Sync] ⚠️ settlement_items ${row.row_id} has undefined product_id, converting to null`);
            syncPayload.product_id = null;
          }
          if (syncPayload.product_id === null) {
            console.log(`[Sync] ℹ️ settlement_items ${row.row_id} has NULL product_id (product may be deleted)`);
          }
          console.log('[Sync] ✅ Pushing settlement_items:', row.row_id);
          console.log('[Sync] settlement_items payload:', {
            id: syncPayload.id,
            settlement_id: syncPayload.settlement_id,
            product_id: syncPayload.product_id,
            product_name: syncPayload.product_name,
            keys: Object.keys(syncPayload)
          });
        }

        if (row.table_name === 'inventory_items') {
          console.log('[Sync] inventory_items payload keys:', Object.keys(syncPayload));
          console.log(`[Sync] DEBUG inventory_items payload for ${row.row_id}:`, {
            current_qty: syncPayload.current_qty,
            reorder_level_qty: syncPayload.reorder_level_qty,
            name: syncPayload.name
          });
        }

        if (row.table_name === 'users') {
          if (SYSTEM_USER_ID_SET.has(syncPayload.id)) {
            const systemUser = SYSTEM_USERS.find(user => user.id === syncPayload.id);
            const fallbackPin = systemUser?.pin;
            const pin = isPlainFourDigitPin(syncPayload.pin_hash)
              ? syncPayload.pin_hash
              : (isPlainFourDigitPin(syncPayload.pin) ? syncPayload.pin : fallbackPin);
            if (pin) {
              syncPayload.pin_hash = pin;
              syncPayload.pin = pin;
            }
          }
          console.log('[Sync] users payload keys:', Object.keys(syncPayload));
        }

        if (row.op === 'upsert') {
          let { error } = await supabase
            .from(row.table_name)
            .upsert(syncPayload, { onConflict: 'id' });

          if (error && row.table_name === 'inventory_items' && error.code === '23503' && error.message?.includes('inventory_storage_groups')) {
            console.log(`[Sync] ⚠️ FK error for inventory_item ${row.row_id}: missing storage group ${syncPayload.storage_group_id}`);
            
            if (syncPayload.storage_group_id) {
              try {
                const localGroup = await db.getFirstAsync<any>(
                  'SELECT * FROM inventory_storage_groups WHERE id = ?',
                  [syncPayload.storage_group_id]
                );
                
                if (localGroup) {
                  console.log(`[Sync] Pushing missing storage group ${localGroup.id} (${localGroup.name})`);
                  
                  const groupPayload = stripLocalOnlyColumns('inventory_storage_groups', localGroup);
                  const { error: groupError } = await supabase
                    .from('inventory_storage_groups')
                    .upsert(groupPayload, { onConflict: 'id' });
                  
                  if (groupError) {
                    console.error('[Sync] Failed to push missing group:', groupError);
                  } else {
                    console.log('[Sync] FK missing group, pushed group then retrying item');
                    
                    const retryResult = await supabase
                      .from(row.table_name)
                      .upsert(syncPayload, { onConflict: 'id' });
                    
                    error = retryResult.error ?? null;
                    
                    if (!error) {
                      console.log(`[Sync] ✅ Retry successful for inventory_item ${row.row_id}`);
                    }
                  }
                }
              } catch (retryError) {
                console.error('[Sync] Error during FK retry:', retryError);
              }
            }
          }

          if (error) {
            throw error;
          }

          if (row.table_name === 'settlements' || row.table_name === 'settlement_items') {
            console.log(`[Sync] ✅ SUCCESS: Pushed ${row.table_name} upsert: ${row.row_id}`);
            
            const { data: verifyData, error: verifyError } = await supabase
              .from(row.table_name)
              .select('id')
              .eq('id', row.row_id)
              .single();
            
            if (verifyError || !verifyData) {
              console.error(`[Sync] ⚠️ RLS WARNING: Pushed ${row.table_name} ${row.row_id} but cannot read it back!`);
              console.error('[Sync] This indicates Row Level Security (RLS) policies are blocking SELECT.');
              console.error('[Sync] Fix: Update Supabase RLS policies to allow SELECT for all authenticated users.');
            } else {
              console.log(`[Sync] ✅ Verified ${row.table_name} ${row.row_id} is readable after push`);
            }
          } else {
            console.log(`[Sync] Pushed ${row.table_name} upsert: ${row.row_id}`);
          }

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
        await db.runAsync(
          `UPDATE sync_outbox
           SET sync_status = 'synced', synced_at = ?, last_error = NULL
           WHERE id = ?`,
          [Date.now(), row.id]
        );
      } catch (error: any) {
        if (row.table_name === 'settlements' || row.table_name === 'settlement_items') {
          console.error(`[Sync] ❌ FAILED to push ${row.table_name}:`, error);
          console.error('[Sync] Error details:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
        } else {
          console.error(`[Sync] Failed to push ${row.table_name}:`, error);
        }
        const errorMsg = error.message || String(error);
        
        if (errorMsg.toLowerCase().includes('invalid api key')) {
          console.error('[Sync] Invalid API key detected - stopping sync');
          db = await getDatabase();
          await db.runAsync(
            `UPDATE sync_outbox
             SET attempts = attempts + 1, last_error = ?, sync_status = 'failed', last_attempt_at = ?
             WHERE id = ?`,
            [errorMsg, Date.now(), row.id]
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
          return { success: false, didWork: false, error: 'Invalid API key. Please check your credentials.' };
        }

        if (isPermanentError(error)) {
          const permanentMessage = errorMsg.toLowerCase().includes('auth') || errorMsg.toLowerCase().includes('unauthorized')
            ? 'Authentication required. Please sign in again to retry.'
            : errorMsg.toLowerCase().includes('permission') || errorMsg.toLowerCase().includes('forbidden')
              ? 'Permission denied. Please re-authenticate to retry.'
              : errorMsg;

          db = await getDatabase();
          await db.runAsync(
            `UPDATE sync_outbox
             SET attempts = attempts + 1, last_error = ?, sync_status = 'failed', last_attempt_at = ?
             WHERE id = ?`,
            [permanentMessage, Date.now(), row.id]
          );
          continue;
        }

        if (isRetryableError(error)) {
          const nextAttempts = row.attempts + 1;
          const retryDelay = getRetryBackoffMs(nextAttempts);
          const retryMessage = errorMsg.toLowerCase().includes('waiting for internet') || errorMsg.toLowerCase().includes('offline')
            ? 'Waiting for internet'
            : `Retrying in ${formatRetryDelay(retryDelay)}`;
          db = await getDatabase();
          await db.runAsync(
            `UPDATE sync_outbox
             SET attempts = attempts + 1, last_error = ?, sync_status = 'pending', last_attempt_at = ?
             WHERE id = ?`,
            [retryMessage, Date.now(), row.id]
          );
          continue;
        }

        db = await getDatabase();
        await db.runAsync(
          `UPDATE sync_outbox
           SET attempts = attempts + 1, last_error = ?, sync_status = 'failed', last_attempt_at = ?
           WHERE id = ?`,
          [errorMsg, Date.now(), row.id]
        );
      }
    }

    updateStatus({ currentStep: 'Pulling updates...' });

    const tables = [
      'users',
      'carts',
      'product_categories',
      'products',
      'inventory_storage_groups',
      'inventory_items',
      'worker_shifts',
      'expenses',
      'settlements',
      'settlement_items'
    ];

    const deferredByTable: Record<string, any[]> = {};
    const fkFailuresByTable: Record<string, number> = {};

    for (const tableName of tables) {
      try {
        db = await getDatabase();
        const stateRows = await db.getAllAsync<SyncStateRow>(
          'SELECT last_sync_at FROM sync_state WHERE table_name = ?',
          [tableName]
        );
        const lastSyncAtRaw = stateRows[0]?.last_sync_at ?? null;
        const lastSyncMs = parseLastSyncAt(lastSyncAtRaw);
        const lastSyncIso = new Date(lastSyncMs).toISOString();

        console.log(`[Sync] 📥 Pulling ${tableName} since ${lastSyncMs} (${lastSyncIso})`);

        let baseQuery = supabase.from(tableName).select('*');
        if (tableName === 'expenses' && isManagerRole) {
          const businessId = currentUserContext?.businessId ?? 'default_business';
          baseQuery = baseQuery.eq('business_id', businessId);
        }
        const { data, error } = await baseQuery
          .gte('updated_at', lastSyncMs)
          .order('updated_at', { ascending: true });

        if (error) {
          console.error(`[Sync] ❌ ERROR pulling ${tableName}:`, {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
          throw error;
        }

        if (data && data.length > 0) {
          console.log(`[Sync] 📦 Received ${data.length} ${tableName} rows`);
          didWork = true;

          updateStatus({ currentStep: `Applying ${tableName} updates...` });
          console.log(`[Sync] ⚙️ Applying ${data.length} ${tableName} rows...`);

          let maxUpdatedAtMs = lastSyncMs;
          let appliedCount = 0;
          let skippedCount = 0;
          let deferredCount = 0;

          for (const remoteRow of data) {
            db = await getDatabase();
            const pendingChanges = await db.getAllAsync<SyncOutboxRow>(
              'SELECT id FROM sync_outbox WHERE table_name = ? AND row_id = ?',
              [tableName, remoteRow.id]
            );

            if (pendingChanges.length > 0) {
              skippedCount++;
              continue;
            }

            if (tableName === 'expenses') {
              const createdAtMs = coerceMsTimestamp(remoteRow.created_at);
              const updatedAtMs = coerceMsTimestamp(remoteRow.updated_at);
              const reviewedAtMs = coerceMsTimestamp(remoteRow.reviewed_at);

              if (remoteRow.is_deleted === null || remoteRow.is_deleted === undefined) {
                remoteRow.is_deleted = 0;
              } else if (typeof remoteRow.is_deleted === 'boolean') {
                remoteRow.is_deleted = remoteRow.is_deleted ? 1 : 0;
              }

              if (remoteRow.is_saved === null || remoteRow.is_saved === undefined) {
                remoteRow.is_saved = 0;
              } else if (typeof remoteRow.is_saved === 'boolean') {
                remoteRow.is_saved = remoteRow.is_saved ? 1 : 0;
              }

              if (!remoteRow.business_id) {
                remoteRow.business_id = currentUserContext?.businessId ?? 'default_business';
              }

              if (createdAtMs !== null) {
                remoteRow.created_at = createdAtMs;
              }
              if (updatedAtMs !== null) {
                remoteRow.updated_at = updatedAtMs;
              }
              if (reviewedAtMs !== null) {
                remoteRow.reviewed_at = reviewedAtMs;
              }

              remoteRow.created_at_iso = ensureIsoTimestamp(remoteRow.created_at_iso, createdAtMs);
              remoteRow.updated_at_iso = ensureIsoTimestamp(remoteRow.updated_at_iso, updatedAtMs);

              const storagePath = getReceiptStoragePath(remoteRow);
              if (storagePath) {
                remoteRow.receipt_storage_path = storagePath;
                if (!remoteRow.receipt_image_uri || isLocalFileUri(remoteRow.receipt_image_uri)) {
                  remoteRow.receipt_image_uri = await resolveReceiptUrl(supabase, storagePath);
                }
              }
            }

            if (remoteRow.deleted_at) {
              const tableColumns = await db.getAllAsync<{ name: string }>(
                `PRAGMA table_info(${tableName})`
              );
              const columnNames = new Set(tableColumns.map(col => col.name));
              
              try {
                if (columnNames.has('is_deleted') && columnNames.has('deleted_at')) {
                  await db.runAsync(
                    `UPDATE ${tableName} SET deleted_at = ?, is_deleted = 1, updated_at = ? WHERE id = ?`,
                    [remoteRow.deleted_at, Date.now(), remoteRow.id]
                  );
                } else if (columnNames.has('is_active')) {
                  await db.runAsync(
                    `UPDATE ${tableName} SET deleted_at = ?, is_active = 0, updated_at = ? WHERE id = ?`,
                    [remoteRow.deleted_at, Date.now(), remoteRow.id]
                  );
                } else {
                  await db.runAsync(
                    `UPDATE ${tableName} SET deleted_at = ?, updated_at = ? WHERE id = ?`,
                    [remoteRow.deleted_at, Date.now(), remoteRow.id]
                  );
                }
                appliedCount++;
              } catch (deleteError: any) {
                if (deleteError.message?.includes('FOREIGN KEY')) {
                  deferredByTable[tableName] = deferredByTable[tableName] || [];
                  deferredByTable[tableName].push(remoteRow);
                  deferredCount++;
                } else {
                  throw deleteError;
                }
              }
            } else {
              if (tableName === 'settlements') {
                const NotificationRepository = (await import('../repositories/notification.repository')).NotificationRepository;
                const notifRepo = new NotificationRepository();
                
                const alreadyExists = await notifRepo.checkIfExists('settlement_incoming', remoteRow.id);
                if (!alreadyExists && remoteRow.status === 'SAVED') {
                  await notifRepo.create(
                    'settlement_incoming',
                    remoteRow.id,
                    'settlement',
                    'New Settlement',
                    `Settlement from shift ${remoteRow.shift_id}`
                  );
                }
              }

              if (tableName === 'settlement_items') {
                if (remoteRow.product_id === undefined || remoteRow.product_id === '') {
                  remoteRow.product_id = null;
                }

                if (remoteRow.product_id !== null) {
                  const productExists = await db.getFirstAsync<{ id: string }>(
                    'SELECT id FROM products WHERE id = ?',
                    [remoteRow.product_id]
                  );

                  if (!productExists) {
                    remoteRow.product_id = null;
                  }
                }
              }

              const localSchema = await db.getAllAsync<{ name: string }>(
                `PRAGMA table_info(${tableName})`
              );
              const localColumns = new Set(localSchema.map(col => col.name));

              const columns = Object.keys(remoteRow).filter(col => localColumns.has(col));
              const placeholders = columns.map(() => '?').join(', ');

              if (tableName === 'users') {
                const normalizedRole = normalizeUserRole(remoteRow.role);
                if (!normalizedRole) {
                  skippedCount++;
                  continue;
                }

                remoteRow.role = normalizedRole;

                const isValidSystemUser = SYSTEM_USER_ID_SET.has(remoteRow.id);
                remoteRow.is_system = isValidSystemUser ? 1 : 0;

                const localUser = await db.getFirstAsync<any>(
                  'SELECT id, role, pin, pin_hash, is_system FROM users WHERE id = ?',
                  [remoteRow.id]
                );

                const incomingPin = isPlainFourDigitPin(remoteRow.pin_hash)
                  ? remoteRow.pin_hash
                  : (isPlainFourDigitPin(remoteRow.pin) ? remoteRow.pin : null);

                if (isValidSystemUser) {
                  const localPin = localUser?.pin_hash || localUser?.pin;
                  if (!incomingPin && localPin) {
                    remoteRow.pin_hash = localPin;
                    remoteRow.pin = localPin;
                  } else if (incomingPin) {
                    remoteRow.pin_hash = incomingPin;
                    remoteRow.pin = incomingPin;
                  }
                } else if (remoteRow.pin_hash && !remoteRow.pin) {
                  remoteRow.pin = remoteRow.pin_hash;
                }
              }

              const insertSQL = `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
              const values = columns.map(col => remoteRow[col]);

              try {
                await db.runAsync(insertSQL, values);
                appliedCount++;
              } catch (insertError: any) {
                if (insertError.message?.includes('FOREIGN KEY')) {
                  deferredByTable[tableName] = deferredByTable[tableName] || [];
                  deferredByTable[tableName].push(remoteRow);
                  deferredCount++;
                  fkFailuresByTable[tableName] = (fkFailuresByTable[tableName] || 0) + 1;
                } else {
                  throw insertError;
                }
              }
            }

            const updatedAtMs = coerceMsTimestamp(remoteRow.updated_at);
            if (updatedAtMs !== null && updatedAtMs > maxUpdatedAtMs) {
              maxUpdatedAtMs = updatedAtMs;
            }
          }

          console.log(`[Sync] ✅ Applied ${appliedCount} ${tableName} rows (skipped ${skippedCount}, deferred ${deferredCount})`);
          console.log(`[Sync] 🕒 Max ${tableName} updated_at: ${maxUpdatedAtMs} (${new Date(maxUpdatedAtMs).toISOString()})`);

          if (deferredCount === 0) {
            db = await getDatabase();
            await db.runAsync(
              'UPDATE sync_state SET last_sync_at = ? WHERE table_name = ?',
              [String(maxUpdatedAtMs), tableName]
            );
          } else {
            console.log(`[Sync] ⚠️ NOT updating last_sync_at for ${tableName} - ${deferredCount} rows deferred due to FK failures`);
          }

          if (tableName === 'users') {
            await ensureSystemUsers();
          }
        }
      } catch (error: any) {
        console.error(`[Sync] ❌ Failed to pull ${tableName}:`, error.message || String(error));
        updateStatus({ lastError: error.message || String(error) });
      }
    }

    if (Object.keys(deferredByTable).length > 0) {
      const totalDeferred = Object.values(deferredByTable).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`[Sync] 🔄 Retrying ${totalDeferred} deferred rows across ${Object.keys(deferredByTable).length} tables...`);
      
      const maxRetries = 3;
      for (let retryAttempt = 1; retryAttempt <= maxRetries; retryAttempt++) {
        if (Object.keys(deferredByTable).length === 0) break;
        
        console.log(`[Sync] 🔄 Retry attempt ${retryAttempt}/${maxRetries}`);
        const stillDeferred: Record<string, any[]> = {};
        
        for (const tableName of tables) {
          const deferredRows = deferredByTable[tableName];
          if (!deferredRows || deferredRows.length === 0) continue;
          
          db = await getDatabase();
          let retrySuccess = 0;
          let retryFailed = 0;
          
          for (const remoteRow of deferredRows) {
            try {
              if (remoteRow.deleted_at) {
                const tableColumns = await db.getAllAsync<{ name: string }>(
                  `PRAGMA table_info(${tableName})`
                );
                const columnNames = new Set(tableColumns.map(col => col.name));
                
                if (columnNames.has('is_deleted') && columnNames.has('deleted_at')) {
                  await db.runAsync(
                    `UPDATE ${tableName} SET deleted_at = ?, is_deleted = 1, updated_at = ? WHERE id = ?`,
                    [remoteRow.deleted_at, Date.now(), remoteRow.id]
                  );
                } else if (columnNames.has('is_active')) {
                  await db.runAsync(
                    `UPDATE ${tableName} SET deleted_at = ?, is_active = 0, updated_at = ? WHERE id = ?`,
                    [remoteRow.deleted_at, Date.now(), remoteRow.id]
                  );
                } else {
                  await db.runAsync(
                    `UPDATE ${tableName} SET deleted_at = ?, updated_at = ? WHERE id = ?`,
                    [remoteRow.deleted_at, Date.now(), remoteRow.id]
                  );
                }
              } else {
                if (tableName === 'settlement_items') {
                  if (remoteRow.product_id === undefined || remoteRow.product_id === '') {
                    remoteRow.product_id = null;
                  }
                  if (remoteRow.product_id !== null) {
                    const productExists = await db.getFirstAsync<{ id: string }>(
                      'SELECT id FROM products WHERE id = ?',
                      [remoteRow.product_id]
                    );
                    if (!productExists) {
                      remoteRow.product_id = null;
                    }
                  }
                }

                if (tableName === 'users') {
                  const normalizedRole = normalizeUserRole(remoteRow.role);
                  if (!normalizedRole) {
                    retryFailed++;
                    continue;
                  }
                  remoteRow.role = normalizedRole;

                  const isValidSystemUser = SYSTEM_USER_ID_SET.has(remoteRow.id);
                  remoteRow.is_system = isValidSystemUser ? 1 : 0;

                  const localUser = await db.getFirstAsync<any>(
                    'SELECT id, role, pin, pin_hash, is_system FROM users WHERE id = ?',
                    [remoteRow.id]
                  );

                  const incomingPin = isPlainFourDigitPin(remoteRow.pin_hash)
                    ? remoteRow.pin_hash
                    : (isPlainFourDigitPin(remoteRow.pin) ? remoteRow.pin : null);

                  if (isValidSystemUser) {
                    const localPin = localUser?.pin_hash || localUser?.pin;
                    if (!incomingPin && localPin) {
                      remoteRow.pin_hash = localPin;
                      remoteRow.pin = localPin;
                    } else if (incomingPin) {
                      remoteRow.pin_hash = incomingPin;
                      remoteRow.pin = incomingPin;
                    }
                  } else if (remoteRow.pin_hash && !remoteRow.pin) {
                    remoteRow.pin = remoteRow.pin_hash;
                  }
                }

                const localSchema = await db.getAllAsync<{ name: string }>(
                  `PRAGMA table_info(${tableName})`
                );
                const localColumns = new Set(localSchema.map(col => col.name));
                const columns = Object.keys(remoteRow).filter(col => localColumns.has(col));
                const placeholders = columns.map(() => '?').join(', ');
                const insertSQL = `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
                const values = columns.map(col => remoteRow[col]);

                await db.runAsync(insertSQL, values);
              }
              
              retrySuccess++;
              
              if (remoteRow.updated_at !== undefined && remoteRow.updated_at !== null) {
                const updatedAtMs = coerceMsTimestamp(remoteRow.updated_at);
                if (updatedAtMs === null) {
                  continue;
                }
                const stateRows = await db.getAllAsync<SyncStateRow>(
                  'SELECT last_sync_at FROM sync_state WHERE table_name = ?',
                  [tableName]
                );
                const lastSyncMs = parseLastSyncAt(stateRows[0]?.last_sync_at ?? null);
                
                if (updatedAtMs > lastSyncMs) {
                  await db.runAsync(
                    'UPDATE sync_state SET last_sync_at = ? WHERE table_name = ?',
                    [String(updatedAtMs), tableName]
                  );
                }
              }
            } catch (retryError: any) {
              if (retryError.message?.includes('FOREIGN KEY')) {
                stillDeferred[tableName] = stillDeferred[tableName] || [];
                stillDeferred[tableName].push(remoteRow);
                retryFailed++;
              } else {
                console.error(`[Sync] ❌ Retry error for ${tableName} ${remoteRow.id}:`, retryError.message);
                retryFailed++;
              }
            }
          }
          
          if (retrySuccess > 0 || retryFailed > 0) {
            console.log(`[Sync] 📊 ${tableName} retry: ${retrySuccess} success, ${retryFailed} still failed`);
          }
        }
        
        Object.assign(deferredByTable, stillDeferred);
      }
      
      if (Object.keys(deferredByTable).length > 0) {
        const remainingDeferred = Object.entries(deferredByTable).map(([table, rows]) => `${table}=${rows.length}`);
        console.log(`[Sync] ⚠️ FK failures after retries: ${remainingDeferred.join(', ')} (deferred)`);
      }
    }

    if (Object.keys(fkFailuresByTable).length > 0) {
      const fkSummary = Object.entries(fkFailuresByTable).map(([table, count]) => `${table}=${count}`).join(', ');
      console.log(`[Sync] 📊 FK failure summary: ${fkSummary}`);
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
    console.log(`[Sync] Completed with didWork=${didWork}`);
    return { success: true, didWork };
  } catch (error: any) {
    console.error('[Sync] Error:', error);
    updateStatus({ 
      isRunning: false, 
      currentStep: 'idle', 
      lastError: error.message || String(error) 
    });
    syncInProgress = false;
    return { success: false, didWork: false, error: error.message || String(error) };
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
