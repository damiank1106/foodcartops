import { BaseRepository } from './base';
import { StockBalance, StockBalanceCache } from '../types';

export class StockBalanceRepository extends BaseRepository {
  async getBalance(inventory_item_id: string, stock_location_id: string): Promise<number> {
    console.log(`[StockBalanceRepository] Getting balance for item ${inventory_item_id} at location ${stock_location_id}`);
    const db = await this.getDb();
    
    const result = await db.getFirstAsync<{ qty: number }>(
      `SELECT qty FROM stock_balances_cache WHERE inventory_item_id = ? AND stock_location_id = ?`,
      [inventory_item_id, stock_location_id]
    );

    return result?.qty || 0;
  }

  async updateBalance(inventory_item_id: string, stock_location_id: string, qty_delta: number): Promise<void> {
    console.log(`[StockBalanceRepository] Updating balance: item=${inventory_item_id}, location=${stock_location_id}, delta=${qty_delta}`);
    const db = await this.getDb();
    const now = this.now();

    const existing = await db.getFirstAsync<StockBalanceCache>(
      `SELECT * FROM stock_balances_cache WHERE inventory_item_id = ? AND stock_location_id = ?`,
      [inventory_item_id, stock_location_id]
    );

    if (existing) {
      const newQty = existing.qty + qty_delta;
      await db.runAsync(
        `UPDATE stock_balances_cache SET qty = ?, updated_at = ? WHERE inventory_item_id = ? AND stock_location_id = ?`,
        [newQty, now, inventory_item_id, stock_location_id]
      );
      console.log(`[StockBalanceRepository] Updated balance to ${newQty}`);
    } else {
      await db.runAsync(
        `INSERT INTO stock_balances_cache (inventory_item_id, stock_location_id, qty, updated_at)
         VALUES (?, ?, ?, ?)`,
        [inventory_item_id, stock_location_id, qty_delta, now]
      );
      console.log(`[StockBalanceRepository] Created balance: ${qty_delta}`);
    }
  }

  async getBalancesForLocation(stock_location_id: string): Promise<StockBalance[]> {
    console.log(`[StockBalanceRepository] Fetching balances for location: ${stock_location_id}`);
    const db = await this.getDb();
    
    const query = `
      SELECT 
        sbc.inventory_item_id,
        ii.name as inventory_item_name,
        ii.unit,
        sbc.stock_location_id,
        sl.name as stock_location_name,
        sbc.qty,
        ii.reorder_level_qty,
        CASE WHEN sbc.qty <= ii.reorder_level_qty THEN 1 ELSE 0 END as is_low_stock
      FROM stock_balances_cache sbc
      JOIN inventory_items ii ON sbc.inventory_item_id = ii.id
      JOIN stock_locations sl ON sbc.stock_location_id = sl.id
      WHERE sbc.stock_location_id = ? AND ii.is_active = 1 AND sl.is_active = 1
      ORDER BY ii.name ASC
    `;

    const result = await db.getAllAsync<StockBalance>(query, [stock_location_id]);
    console.log(`[StockBalanceRepository] Found ${result.length} balances`);
    return result;
  }

  async getBalancesForCart(cart_id: string): Promise<StockBalance[]> {
    console.log(`[StockBalanceRepository] Fetching balances for cart: ${cart_id}`);
    const db = await this.getDb();
    
    const query = `
      SELECT 
        sbc.inventory_item_id,
        ii.name as inventory_item_name,
        ii.unit,
        sbc.stock_location_id,
        sl.name as stock_location_name,
        sbc.qty,
        ii.reorder_level_qty,
        CASE WHEN sbc.qty <= ii.reorder_level_qty THEN 1 ELSE 0 END as is_low_stock
      FROM stock_balances_cache sbc
      JOIN inventory_items ii ON sbc.inventory_item_id = ii.id
      JOIN stock_locations sl ON sbc.stock_location_id = sl.id
      WHERE sl.cart_id = ? AND sl.type = 'CART' AND ii.is_active = 1 AND sl.is_active = 1
      ORDER BY ii.name ASC
    `;

    const result = await db.getAllAsync<StockBalance>(query, [cart_id]);
    console.log(`[StockBalanceRepository] Found ${result.length} balances for cart`);
    return result;
  }

  async getLowStockItems(): Promise<StockBalance[]> {
    console.log('[StockBalanceRepository] Fetching low stock items');
    const db = await this.getDb();
    
    const query = `
      SELECT 
        sbc.inventory_item_id,
        ii.name as inventory_item_name,
        ii.unit,
        sbc.stock_location_id,
        sl.name as stock_location_name,
        sbc.qty,
        ii.reorder_level_qty,
        1 as is_low_stock
      FROM stock_balances_cache sbc
      JOIN inventory_items ii ON sbc.inventory_item_id = ii.id
      JOIN stock_locations sl ON sbc.stock_location_id = sl.id
      WHERE sbc.qty <= ii.reorder_level_qty AND ii.is_active = 1 AND sl.is_active = 1
      ORDER BY (sbc.qty - ii.reorder_level_qty) ASC, ii.name ASC
    `;

    const result = await db.getAllAsync<StockBalance>(query);
    console.log(`[StockBalanceRepository] Found ${result.length} low stock items`);
    return result;
  }

  async recalculateBalances(): Promise<void> {
    console.log('[StockBalanceRepository] Recalculating all balances from movements');
    const db = await this.getDb();
    const now = this.now();

    await db.runAsync('DELETE FROM stock_balances_cache');

    const movements = await db.getAllAsync<{
      inventory_item_id: string;
      from_location_id: string | null;
      to_location_id: string | null;
      qty: number;
    }>(`SELECT inventory_item_id, from_location_id, to_location_id, qty FROM stock_movements ORDER BY created_at ASC`);

    const balances = new Map<string, number>();

    for (const m of movements) {
      if (m.from_location_id) {
        const key = `${m.inventory_item_id}:${m.from_location_id}`;
        balances.set(key, (balances.get(key) || 0) - m.qty);
      }
      if (m.to_location_id) {
        const key = `${m.inventory_item_id}:${m.to_location_id}`;
        balances.set(key, (balances.get(key) || 0) + m.qty);
      }
    }

    for (const [key, qty] of balances.entries()) {
      const [inventory_item_id, stock_location_id] = key.split(':');
      await db.runAsync(
        `INSERT INTO stock_balances_cache (inventory_item_id, stock_location_id, qty, updated_at)
         VALUES (?, ?, ?, ?)`,
        [inventory_item_id, stock_location_id, qty, now]
      );
    }

    console.log(`[StockBalanceRepository] Recalculated ${balances.size} balances`);
  }
}
