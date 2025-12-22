import { BaseRepository } from './base';
import { StockMovement, StockMovementWithDetails } from '../types';
import { AuditRepository } from './audit.repository';

export class StockMovementRepository extends BaseRepository {
  private auditRepo = new AuditRepository();

  async create(data: {
    inventory_item_id: string;
    from_location_id?: string;
    to_location_id?: string;
    qty: number;
    reason: 'PURCHASE' | 'ISSUE_TO_CART' | 'RETURN_TO_WAREHOUSE' | 'WASTE' | 'ADJUSTMENT' | 'TRANSFER';
    cost_cents?: number;
    shift_id?: string;
    actor_user_id: string;
    notes?: string;
  }): Promise<StockMovement> {
    console.log('[StockMovementRepository] Creating stock movement');
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const movement: StockMovement = {
      id,
      inventory_item_id: data.inventory_item_id,
      from_location_id: data.from_location_id,
      to_location_id: data.to_location_id,
      qty: data.qty,
      reason: data.reason,
      cost_cents: data.cost_cents,
      shift_id: data.shift_id,
      actor_user_id: data.actor_user_id,
      notes: data.notes,
      created_at: now,
    };

    await db.runAsync(
      `INSERT INTO stock_movements (id, inventory_item_id, from_location_id, to_location_id, qty, reason, cost_cents, shift_id, actor_user_id, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movement.id,
        movement.inventory_item_id,
        movement.from_location_id || null,
        movement.to_location_id || null,
        movement.qty,
        movement.reason,
        movement.cost_cents || null,
        movement.shift_id || null,
        movement.actor_user_id,
        movement.notes || null,
        movement.created_at,
      ]
    );

    await this.auditRepo.log({
      user_id: data.actor_user_id,
      entity_type: 'stock_movement',
      entity_id: id,
      action: 'create',
      new_data: JSON.stringify(movement),
    });

    console.log(`[StockMovementRepository] Created stock movement: ${id}`);
    return movement;
  }

  async listByItem(inventory_item_id: string, limit?: number): Promise<StockMovementWithDetails[]> {
    console.log(`[StockMovementRepository] Fetching movements for item: ${inventory_item_id}`);
    const db = await this.getDb();
    
    const query = `
      SELECT 
        sm.*,
        ii.name as inventory_item_name,
        from_loc.name as from_location_name,
        to_loc.name as to_location_name,
        u.name as actor_name
      FROM stock_movements sm
      JOIN inventory_items ii ON sm.inventory_item_id = ii.id
      LEFT JOIN stock_locations from_loc ON sm.from_location_id = from_loc.id
      LEFT JOIN stock_locations to_loc ON sm.to_location_id = to_loc.id
      JOIN users u ON sm.actor_user_id = u.id
      WHERE sm.inventory_item_id = ?
      ORDER BY sm.created_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    const result = await db.getAllAsync<StockMovementWithDetails>(query, [inventory_item_id]);
    console.log(`[StockMovementRepository] Found ${result.length} movements`);
    return result;
  }

  async listByLocation(location_id: string, limit?: number): Promise<StockMovementWithDetails[]> {
    console.log(`[StockMovementRepository] Fetching movements for location: ${location_id}`);
    const db = await this.getDb();
    
    const query = `
      SELECT 
        sm.*,
        ii.name as inventory_item_name,
        from_loc.name as from_location_name,
        to_loc.name as to_location_name,
        u.name as actor_name
      FROM stock_movements sm
      JOIN inventory_items ii ON sm.inventory_item_id = ii.id
      LEFT JOIN stock_locations from_loc ON sm.from_location_id = from_loc.id
      LEFT JOIN stock_locations to_loc ON sm.to_location_id = to_loc.id
      JOIN users u ON sm.actor_user_id = u.id
      WHERE sm.from_location_id = ? OR sm.to_location_id = ?
      ORDER BY sm.created_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    const result = await db.getAllAsync<StockMovementWithDetails>(query, [location_id, location_id]);
    console.log(`[StockMovementRepository] Found ${result.length} movements`);
    return result;
  }

  async listRecent(limit: number = 100): Promise<StockMovementWithDetails[]> {
    console.log(`[StockMovementRepository] Fetching recent movements (limit: ${limit})`);
    const db = await this.getDb();
    
    const query = `
      SELECT 
        sm.*,
        ii.name as inventory_item_name,
        from_loc.name as from_location_name,
        to_loc.name as to_location_name,
        u.name as actor_name
      FROM stock_movements sm
      JOIN inventory_items ii ON sm.inventory_item_id = ii.id
      LEFT JOIN stock_locations from_loc ON sm.from_location_id = from_loc.id
      LEFT JOIN stock_locations to_loc ON sm.to_location_id = to_loc.id
      JOIN users u ON sm.actor_user_id = u.id
      ORDER BY sm.created_at DESC
      LIMIT ?
    `;

    const result = await db.getAllAsync<StockMovementWithDetails>(query, [limit]);
    console.log(`[StockMovementRepository] Found ${result.length} movements`);
    return result;
  }

  async listByReason(reason: string, limit?: number): Promise<StockMovementWithDetails[]> {
    console.log(`[StockMovementRepository] Fetching movements by reason: ${reason}`);
    const db = await this.getDb();
    
    const query = `
      SELECT 
        sm.*,
        ii.name as inventory_item_name,
        from_loc.name as from_location_name,
        to_loc.name as to_location_name,
        u.name as actor_name
      FROM stock_movements sm
      JOIN inventory_items ii ON sm.inventory_item_id = ii.id
      LEFT JOIN stock_locations from_loc ON sm.from_location_id = from_loc.id
      LEFT JOIN stock_locations to_loc ON sm.to_location_id = to_loc.id
      JOIN users u ON sm.actor_user_id = u.id
      WHERE sm.reason = ?
      ORDER BY sm.created_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    const result = await db.getAllAsync<StockMovementWithDetails>(query, [reason]);
    console.log(`[StockMovementRepository] Found ${result.length} movements`);
    return result;
  }
}
