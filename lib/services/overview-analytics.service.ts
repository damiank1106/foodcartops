import { getDatabase } from '../database/init';
import type { OverviewPoint } from '../../components/AnimatedDashboardChart';

function startOfDayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}
function endOfDayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

export async function getTodayOverviewSeries(): Promise<OverviewPoint[]> {
  const db = await getDatabase();

  const buckets = Array.from({ length: 15 }, (_, i) => ({
    x: i,
    sales: 0,
    expenses: 0,
    transactions: 0,
    activeUsers: 0,
  })) as OverviewPoint[];

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const bucketMs = (24 * 60 * 60 * 1000) / 15;

  const toBucket = (iso: string) => {
    const t = new Date(iso).getTime() - dayStart.getTime();
    const idx = Math.max(0, Math.min(14, Math.floor(t / bucketMs)));
    return idx;
  };

  try {
    const rows = await db.getAllAsync<any>(
      `SELECT created_at_iso, gross_sales_cents
       FROM settlements
       WHERE deleted_at IS NULL
         AND is_deleted = 0
         AND (status = 'SAVED' OR status = 'FINALIZED')
         AND created_at_iso >= ?
         AND created_at_iso <= ?`,
      [startOfDayISO(), endOfDayISO()]
    );

    for (const r of rows) {
      const b = toBucket(r.created_at_iso);
      const cents = Number(r.gross_sales_cents ?? 0);
      buckets[b].sales = (buckets[b].sales ?? 0) + Math.round(cents / 100);
      buckets[b].transactions = (buckets[b].transactions ?? 0) + 1;
    }
    console.log(`[Overview Analytics] Found ${rows.length} settlements for today`);
  } catch (e) {
    console.log('[Overview Analytics] Error loading settlements:', e);
  }

  try {
    const rows = await db.getAllAsync<any>(
      `SELECT created_at_iso, amount_cents
       FROM expenses
       WHERE deleted_at IS NULL
         AND is_deleted = 0
         AND status = 'APPROVED'
         AND created_at_iso >= ?
         AND created_at_iso <= ?`,
      [startOfDayISO(), endOfDayISO()]
    );
    for (const r of rows) {
      const b = toBucket(r.created_at_iso);
      const cents = Number(r.amount_cents ?? 0);
      buckets[b].expenses = (buckets[b].expenses ?? 0) + Math.round(cents / 100);
    }
    console.log(`[Overview Analytics] Found ${rows.length} expenses for today`);
  } catch (e) {
    console.log('[Overview Analytics] Error loading expenses:', e);
  }

  try {
    const rows = await db.getAllAsync<any>(
      `SELECT COUNT(*) as c
       FROM worker_shifts
       WHERE status = 'ACTIVE'
         AND deleted_at IS NULL
         AND is_deleted = 0`
    );
    const activeCount = Number(rows?.[0]?.c ?? 0);
    for (let i = 0; i < buckets.length; i++) buckets[i].activeUsers = activeCount;
    console.log(`[Overview Analytics] Found ${activeCount} active users`);
  } catch (e) {
    console.log('[Overview Analytics] Error loading active users:', e);
  }

  return buckets;
}
