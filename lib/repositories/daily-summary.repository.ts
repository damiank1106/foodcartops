import { endOfDay, parseISO, startOfDay } from 'date-fns';
import { BaseRepository } from './base';

export interface DailyProductsSoldItem {
  product_id: string | null;
  product_name: string;
  qty: number;
  total_cents: number;
}

export class DailySummaryRepository extends BaseRepository {
  async getProductsSoldSnapshot(dateKey: string): Promise<DailyProductsSoldItem[]> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ products_sold_json: string }>(
      'SELECT products_sold_json FROM daily_summaries WHERE date_key = ?',
      [dateKey]
    );

    if (!row?.products_sold_json) return [];

    try {
      const parsed = JSON.parse(row.products_sold_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('[DailySummaryRepo] Failed to parse products_sold_json:', error);
      return [];
    }
  }

  async upsertProductsSoldSnapshot(dateKey: string, products: DailyProductsSoldItem[]): Promise<void> {
    const db = await this.getDb();
    const now = this.now();
    const payload = JSON.stringify(products);

    await db.runAsync(
      `INSERT INTO daily_summaries (date_key, products_sold_json, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date_key) DO UPDATE SET products_sold_json = excluded.products_sold_json, updated_at = excluded.updated_at`,
      [dateKey, payload, now, now]
    );
  }

  async getDailyProductsSold(dateKey: string): Promise<DailyProductsSoldItem[]> {
    const db = await this.getDb();
    const date = parseISO(dateKey);
    const start = startOfDay(date).getTime();
    const end = endOfDay(date).getTime();

    const rows = await db.getAllAsync<DailyProductsSoldItem>(
      `SELECT
        si.product_id as product_id,
        COALESCE(p.name, 'Unknown Product') as product_name,
        SUM(si.quantity) as qty,
        SUM(COALESCE(si.line_total_cents, CAST(si.total_price * 100 AS INTEGER))) as total_cents
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id
       WHERE s.created_at >= ? AND s.created_at <= ? AND s.voided_at IS NULL
       GROUP BY si.product_id, COALESCE(p.name, 'Unknown Product')
       ORDER BY qty DESC, product_name ASC`,
      [start, end]
    );

    return rows.map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      qty: Number(row.qty) || 0,
      total_cents: Number(row.total_cents) || 0,
    }));
  }
}
