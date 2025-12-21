import { Settlement, SettlementWithDetails } from '../types';
import { BaseRepository } from './base';

export class SettlementRepository extends BaseRepository {
  async create(
    shiftId: string,
    cartId: string,
    workerUserId: string,
    createdByUserId: string,
    cashExpectedCents: number,
    cashCountedCents: number,
    cashDifferenceCents: number,
    netDueToWorkerCents: number,
    netDueToBossCents: number,
    computedJson: string,
    notes?: string
  ): Promise<Settlement> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = Date.now();

    await db.runAsync(
      `INSERT INTO settlements (
        id, shift_id, cart_id, worker_user_id, created_by_user_id,
        cash_expected_cents, cash_counted_cents, cash_difference_cents,
        net_due_to_worker_cents, net_due_to_boss_cents, computed_json,
        status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
      [
        id,
        shiftId,
        cartId,
        workerUserId,
        createdByUserId,
        cashExpectedCents,
        cashCountedCents,
        cashDifferenceCents,
        netDueToWorkerCents,
        netDueToBossCents,
        computedJson,
        notes || null,
        now,
        now,
      ]
    );

    await this.auditLog(createdByUserId, 'settlements', id, 'create', null, {
      shift_id: shiftId,
      cart_id: cartId,
      worker_user_id: workerUserId,
      status: 'DRAFT',
    });

    return this.findById(id) as Promise<Settlement>;
  }

  async findById(id: string): Promise<Settlement | null> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<Settlement>(
      'SELECT * FROM settlements WHERE id = ?',
      [id]
    );
    return result || null;
  }

  async findByShiftId(shiftId: string): Promise<Settlement | null> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<Settlement>(
      'SELECT * FROM settlements WHERE shift_id = ? ORDER BY created_at DESC LIMIT 1',
      [shiftId]
    );
    return result || null;
  }

  async findWithDetails(id: string): Promise<SettlementWithDetails | null> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<SettlementWithDetails>(
      `SELECT 
        s.*,
        w.name as worker_name,
        c.name as cart_name,
        u1.name as created_by_name,
        u2.name as finalized_by_name
      FROM settlements s
      LEFT JOIN users w ON s.worker_user_id = w.id
      LEFT JOIN carts c ON s.cart_id = c.id
      LEFT JOIN users u1 ON s.created_by_user_id = u1.id
      LEFT JOIN users u2 ON s.finalized_by_user_id = u2.id
      WHERE s.id = ?`,
      [id]
    );
    return result || null;
  }

  async finalize(id: string, finalizedByUserId: string): Promise<void> {
    const db = await this.getDb();
    const now = Date.now();

    const old = await this.findById(id);

    await db.runAsync(
      `UPDATE settlements 
       SET status = 'FINALIZED', finalized_by_user_id = ?, finalized_at = ?, updated_at = ?
       WHERE id = ?`,
      [finalizedByUserId, now, now, id]
    );

    await this.auditLog(finalizedByUserId, 'settlements', id, 'update', old, {
      status: 'FINALIZED',
      finalized_by_user_id: finalizedByUserId,
      finalized_at: now,
    });
  }

  async getUnsettledShifts(cartIds?: string[]): Promise<{ shift_id: string; worker_name: string; cart_name: string; clock_out: number }[]> {
    const db = await this.getDb();
    
    let query = `
      SELECT 
        ws.id as shift_id,
        u.name as worker_name,
        c.name as cart_name,
        ws.clock_out
      FROM worker_shifts ws
      LEFT JOIN users u ON ws.worker_id = u.id
      LEFT JOIN carts c ON ws.cart_id = c.id
      LEFT JOIN settlements s ON ws.id = s.shift_id
      WHERE ws.status = 'ended' AND s.id IS NULL
    `;

    const params: string[] = [];
    if (cartIds && cartIds.length > 0) {
      query += ` AND ws.cart_id IN (${cartIds.map(() => '?').join(',')})`;
      params.push(...cartIds);
    }

    query += ' ORDER BY ws.clock_out DESC';

    const results = await db.getAllAsync<{ shift_id: string; worker_name: string; cart_name: string; clock_out: number }>(query, params);
    return results;
  }

  async getSettlementsByCartIds(cartIds: string[], limit: number = 50): Promise<SettlementWithDetails[]> {
    const db = await this.getDb();
    
    const query = `
      SELECT 
        s.*,
        w.name as worker_name,
        c.name as cart_name,
        u1.name as created_by_name,
        u2.name as finalized_by_name
      FROM settlements s
      LEFT JOIN users w ON s.worker_user_id = w.id
      LEFT JOIN carts c ON s.cart_id = c.id
      LEFT JOIN users u1 ON s.created_by_user_id = u1.id
      LEFT JOIN users u2 ON s.finalized_by_user_id = u2.id
      WHERE s.cart_id IN (${cartIds.map(() => '?').join(',')})
      ORDER BY s.created_at DESC
      LIMIT ?
    `;

    const results = await db.getAllAsync<SettlementWithDetails>(query, [...cartIds, limit]);
    return results;
  }

  async getCashDifferences(cartIds?: string[]): Promise<{ settlement_id: string; shift_id: string; worker_name: string; cash_difference_cents: number; created_at: number }[]> {
    const db = await this.getDb();
    
    let query = `
      SELECT 
        s.id as settlement_id,
        s.shift_id,
        u.name as worker_name,
        s.cash_difference_cents,
        s.created_at
      FROM settlements s
      LEFT JOIN users u ON s.worker_user_id = u.id
      WHERE s.cash_difference_cents != 0 AND s.status = 'FINALIZED'
    `;

    const params: string[] = [];
    if (cartIds && cartIds.length > 0) {
      query += ` AND s.cart_id IN (${cartIds.map(() => '?').join(',')})`;
      params.push(...cartIds);
    }

    query += ' ORDER BY s.created_at DESC LIMIT 20';

    const results = await db.getAllAsync<{ settlement_id: string; shift_id: string; worker_name: string; cash_difference_cents: number; created_at: number }>(query, params);
    return results;
  }
}
