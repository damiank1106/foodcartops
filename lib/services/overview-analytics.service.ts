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

/**
 * Builds 15 buckets across TODAY from local DB.
 * IMPORTANT: This must not crash if some tables aren’t present yet.
 * Use try/catch per query so chart still renders.
 */
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

  // 1) SALES + TRANSACTIONS from settlements
  try {
    // settlements.created_at_iso exists in your schema; deleted_at means soft delete
    const rows = await db.getAllAsync<any>(
      `SELECT created_at_iso, gross_sales_cents
       FROM settlements
       WHERE deleted_at IS NULL
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
  } catch (e) {
    // ignore if table not ready
  }

  // 2) EXPENSES
  try {
    // adjust column name if yours differs (amount_cents / total_cents / cost_cents)
    const rows = await db.getAllAsync<any>(
      `SELECT created_at_iso, amount_cents
       FROM expenses
       WHERE deleted_at IS NULL
         AND created_at_iso >= ?
         AND created_at_iso <= ?`,
      [startOfDayISO(), endOfDayISO()]
    );
    for (const r of rows) {
      const b = toBucket(r.created_at_iso);
      const cents = Number(r.amount_cents ?? 0);
      buckets[b].expenses = (buckets[b].expenses ?? 0) + Math.round(cents / 100);
    }
  } catch (e) {}

  // 3) ACTIVE USERS (active shifts)
  try {
    // adjust columns if needed; goal = count “active” shifts right now
    const rows = await db.getAllAsync<any>(
      `SELECT COUNT(*) as c
       FROM worker_shifts
       WHERE (status = 'ACTIVE' OR clock_out IS NULL)
         AND deleted_at IS NULL`
    );
    const activeCount = Number(rows?.[0]?.c ?? 0);
    // reflect current active count across all buckets so user can see the line
    for (let i = 0; i < buckets.length; i++) buckets[i].activeUsers = activeCount;
  } catch (e) {}

  return buckets;
}
