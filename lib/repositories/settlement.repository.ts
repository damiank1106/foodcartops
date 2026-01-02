import { Settlement, SettlementWithDetails } from '../types';
import { BaseRepository } from './base';
import { getDeviceId } from '../utils/device-id';
import { SyncOutboxRepository } from './sync-outbox.repository';

interface SettlementItem {
  id: string;
  settlement_id: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  price_cents: number;
  business_id: string;
  device_id?: string;
  is_deleted: number;
  deleted_at?: string;
  created_at: number;
  updated_at: number;
  created_at_iso?: string;
  updated_at_iso?: string;
}

export class SettlementRepository extends BaseRepository {
  private syncOutbox = new SyncOutboxRepository();

  private async queueSync(
    tableName: string,
    rowId: string,
    payload: any,
    options?: {
      changeId?: string;
      changeType?: string;
    }
  ): Promise<void> {
    await this.syncOutbox.add(tableName, rowId, 'upsert', payload, options);
    console.log(`[SettlementRepo] Queued sync for ${tableName}:${rowId}`);
  }

  async create(
    shiftId: string,
    cartId: string,
    sellerUserId: string,
    dateIso: string,
    status: 'SAVED' | 'FINALIZED',
    notes: string | undefined,
    cashCents: number,
    gcashCents: number,
    cardCents: number,
    grossSalesCents: number,
    totalCents: number,
    userId: string
  ): Promise<Settlement> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = Date.now();
    const nowISO = new Date().toISOString();
    const deviceId = await getDeviceId();
    const businessId = 'default_business';

    await db.runAsync(
      `INSERT INTO settlements (
        id, shift_id, cart_id, seller_user_id, date_iso, status, notes,
        cash_cents, gcash_cents, card_cents, gross_sales_cents, total_cents,
        business_id, device_id, is_deleted, deleted_at,
        created_at, updated_at, created_at_iso, updated_at_iso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)`,
      [
        id, shiftId, cartId, sellerUserId, dateIso, status, notes || null,
        cashCents, gcashCents, cardCents, grossSalesCents, totalCents,
        businessId, deviceId, now, now, nowISO, nowISO,
      ]
    );

    const payload = {
      id, shift_id: shiftId, cart_id: cartId, seller_user_id: sellerUserId,
      date_iso: dateIso, status, notes: notes || null,
      cash_cents: cashCents, gcash_cents: gcashCents, card_cents: cardCents,
      gross_sales_cents: grossSalesCents, total_cents: totalCents,
      business_id: businessId, device_id: deviceId,
      is_deleted: 0, deleted_at: null,
      created_at: now, updated_at: now,
      created_at_iso: nowISO, updated_at_iso: nowISO,
    };

    await this.queueSync('settlements', id, payload, {
      changeId: id,
      changeType: 'SETTLEMENT_CREATE',
    });

    await this.auditLog(userId, 'settlements', id, 'create', null, {
      shift_id: shiftId,
      seller_user_id: sellerUserId,
      status,
      total_cents: totalCents,
    });

    return this.findById(id) as Promise<Settlement>;
  }

  async createSettlementItem(
    settlementId: string,
    productId: string | null,
    productName: string,
    qty: number,
    priceCents: number,
    userId: string
  ): Promise<void> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = Date.now();
    const nowISO = new Date().toISOString();
    const deviceId = await getDeviceId();
    const businessId = 'default_business';

    await db.runAsync(
      `INSERT INTO settlement_items (
        id, settlement_id, product_id, product_name, qty, price_cents,
        business_id, device_id, is_deleted, deleted_at,
        created_at, updated_at, created_at_iso, updated_at_iso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)`,
      [
        id, settlementId, productId, productName, qty, priceCents,
        businessId, deviceId, now, now, nowISO, nowISO,
      ]
    );

    const payload = {
      id, settlement_id: settlementId, product_id: productId ?? null,
      product_name: productName, qty, price_cents: priceCents,
      business_id: businessId, device_id: deviceId,
      is_deleted: 0, deleted_at: null,
      created_at: now, updated_at: now,
      created_at_iso: nowISO, updated_at_iso: nowISO,
    };

    await this.queueSync('settlement_items', id, payload, {
      changeId: settlementId,
    });

    await this.auditLog(userId, 'settlement_items', id, 'create', null, {
      settlement_id: settlementId,
      product_id: productId,
      qty,
    });

    console.log('[SettlementRepo] Settlement item created:', id);
  }

  async findById(id: string): Promise<Settlement | null> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<Settlement>(
      'SELECT * FROM settlements WHERE id = ? AND deleted_at IS NULL AND is_deleted = 0',
      [id]
    );
    return result || null;
  }

  async findByShiftId(shiftId: string): Promise<Settlement | null> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<Settlement>(
      'SELECT * FROM settlements WHERE shift_id = ? AND deleted_at IS NULL AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1',
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
      LEFT JOIN users w ON s.seller_user_id = w.id
      LEFT JOIN carts c ON s.cart_id = c.id
      LEFT JOIN users u1 ON s.seller_user_id = u1.id
      LEFT JOIN users u2 ON s.seller_user_id = u2.id
      WHERE s.id = ? AND s.deleted_at IS NULL AND s.is_deleted = 0`,
      [id]
    );
    return result || null;
  }

  async getSettlementItems(settlementId: string): Promise<SettlementItem[]> {
    const db = await this.getDb();
    return await db.getAllAsync<SettlementItem>(
      'SELECT * FROM settlement_items WHERE settlement_id = ? AND deleted_at IS NULL AND is_deleted = 0',
      [settlementId]
    );
  }

  async updateSettlement(
    id: string,
    updates: {
      notes?: string;
      cash_cents?: number;
      gcash_cents?: number;
      card_cents?: number;
      gross_sales_cents?: number;
      total_cents?: number;
    },
    userId: string
  ): Promise<void> {
    const db = await this.getDb();
    const old = await this.findById(id);
    if (!old) throw new Error('Settlement not found');

    const now = Date.now();
    const nowISO = new Date().toISOString();
    const deviceId = await getDeviceId();

    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.notes !== undefined) {
      setClauses.push('notes = ?');
      values.push(updates.notes || null);
    }
    if (updates.cash_cents !== undefined) {
      setClauses.push('cash_cents = ?');
      values.push(updates.cash_cents);
    }
    if (updates.gcash_cents !== undefined) {
      setClauses.push('gcash_cents = ?');
      values.push(updates.gcash_cents);
    }
    if (updates.card_cents !== undefined) {
      setClauses.push('card_cents = ?');
      values.push(updates.card_cents);
    }
    if (updates.gross_sales_cents !== undefined) {
      setClauses.push('gross_sales_cents = ?');
      values.push(updates.gross_sales_cents);
    }
    if (updates.total_cents !== undefined) {
      setClauses.push('total_cents = ?');
      values.push(updates.total_cents);
    }

    setClauses.push('updated_at = ?', 'updated_at_iso = ?', 'device_id = ?');
    values.push(now, nowISO, deviceId);

    values.push(id);

    await db.runAsync(
      `UPDATE settlements SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await this.findById(id);
    if (updated) {
      const payload = {
        id: updated.id,
        shift_id: updated.shift_id,
        cart_id: updated.cart_id,
        seller_user_id: (updated as any).seller_user_id,
        date_iso: (updated as any).date_iso,
        status: updated.status,
        notes: updated.notes || null,
        cash_cents: (updated as any).cash_cents || 0,
        gcash_cents: (updated as any).gcash_cents || 0,
        card_cents: (updated as any).card_cents || 0,
        gross_sales_cents: (updated as any).gross_sales_cents || 0,
        total_cents: (updated as any).total_cents || 0,
        business_id: (updated as any).business_id || 'default_business',
        device_id: (updated as any).device_id,
        is_deleted: (updated as any).is_deleted || 0,
        deleted_at: (updated as any).deleted_at || null,
        created_at: (updated as any).created_at || Date.now(),
        updated_at: (updated as any).updated_at || Date.now(),
        created_at_iso: (updated as any).created_at_iso,
        updated_at_iso: (updated as any).updated_at_iso,
      };

      await this.queueSync('settlements', id, payload);
    }

    await this.auditLog(userId, 'settlements', id, 'update', old, updates);
    console.log('[SettlementRepo] Settlement updated:', id);
  }

  async finalize(id: string, userId: string): Promise<void> {
    const db = await this.getDb();
    const old = await this.findById(id);
    if (!old) throw new Error('Settlement not found');

    const now = Date.now();
    const nowISO = new Date().toISOString();
    const deviceId = await getDeviceId();

    await db.runAsync(
      `UPDATE settlements 
       SET status = 'FINALIZED', updated_at = ?, updated_at_iso = ?, device_id = ?
       WHERE id = ?`,
      [now, nowISO, deviceId, id]
    );

    const updated = await this.findById(id);
    if (updated) {
      const payload = {
        id: updated.id,
        shift_id: updated.shift_id,
        cart_id: updated.cart_id,
        seller_user_id: (updated as any).seller_user_id,
        date_iso: (updated as any).date_iso,
        status: 'FINALIZED',
        notes: updated.notes || null,
        cash_cents: (updated as any).cash_cents || 0,
        gcash_cents: (updated as any).gcash_cents || 0,
        card_cents: (updated as any).card_cents || 0,
        gross_sales_cents: (updated as any).gross_sales_cents || 0,
        total_cents: (updated as any).total_cents || 0,
        business_id: (updated as any).business_id || 'default_business',
        device_id: (updated as any).device_id,
        is_deleted: (updated as any).is_deleted || 0,
        deleted_at: (updated as any).deleted_at || null,
        created_at: (updated as any).created_at || Date.now(),
        updated_at: now,
        created_at_iso: (updated as any).created_at_iso,
        updated_at_iso: nowISO,
      };

      await this.queueSync('settlements', id, payload);
    }

    await this.auditLog(userId, 'settlements', id, 'finalize', old, { status: 'FINALIZED' });
    console.log('[SettlementRepo] Settlement finalized:', id);
  }

  async getAllUnsettledShifts(): Promise<{ shift_id: string; worker_name: string; cart_name: string; clock_out: number }[]> {
    const db = await this.getDb();
    
    const query = `
      SELECT 
        ws.id as shift_id,
        u.name as worker_name,
        c.name as cart_name,
        ws.clock_out
      FROM worker_shifts ws
      LEFT JOIN users u ON ws.worker_id = u.id
      LEFT JOIN carts c ON ws.cart_id = c.id
      LEFT JOIN settlements s ON ws.id = s.shift_id AND s.deleted_at IS NULL AND s.is_deleted = 0
      WHERE ws.status = 'ended' AND ws.deleted_at IS NULL AND ws.is_deleted = 0 AND s.id IS NULL
      ORDER BY ws.clock_out DESC
    `;

    const results = await db.getAllAsync<{ shift_id: string; worker_name: string; cart_name: string; clock_out: number }>(query);
    console.log(`[SettlementRepo] getAllUnsettledShifts returned ${results.length} shifts`);
    return results;
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
      LEFT JOIN settlements s ON ws.id = s.shift_id AND s.deleted_at IS NULL AND s.is_deleted = 0
      WHERE ws.status = 'ended' AND ws.deleted_at IS NULL AND ws.is_deleted = 0 AND s.id IS NULL
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

  async getAllSettlements(limit: number = 100): Promise<SettlementWithDetails[]> {
    const db = await this.getDb();
    
    const countResult = await db.getFirstAsync<{ total: number; deleted: number; active: number }>(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN deleted_at IS NOT NULL OR is_deleted = 1 THEN 1 ELSE 0 END) as deleted,
        SUM(CASE WHEN deleted_at IS NULL AND is_deleted = 0 THEN 1 ELSE 0 END) as active
      FROM settlements`
    );
    console.log('[SettlementRepo] getAllSettlements - DB state:', countResult);
    
    const query = `
      SELECT 
        s.*,
        w.name as worker_name,
        c.name as cart_name,
        u1.name as created_by_name,
        u2.name as finalized_by_name
      FROM settlements s
      LEFT JOIN users w ON s.seller_user_id = w.id
      LEFT JOIN carts c ON s.cart_id = c.id
      LEFT JOIN users u1 ON s.seller_user_id = u1.id
      LEFT JOIN users u2 ON s.seller_user_id = u2.id
      WHERE s.deleted_at IS NULL AND s.is_deleted = 0
      ORDER BY s.created_at DESC
      LIMIT ?
    `;

    const results = await db.getAllAsync<SettlementWithDetails>(query, [limit]);
    console.log(`[SettlementRepo] getAllSettlements returned ${results.length} settlements (limit=${limit})`);
    
    if (results.length > 0) {
      console.log('[SettlementRepo] Sample settlements:', results.slice(0, 3).map(s => ({
        id: s.id,
        status: s.status,
        worker_name: s.worker_name,
        business_id: (s as any).business_id,
        is_deleted: (s as any).is_deleted,
        deleted_at: (s as any).deleted_at
      })));
    }
    
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
      LEFT JOIN users w ON s.seller_user_id = w.id
      LEFT JOIN carts c ON s.cart_id = c.id
      LEFT JOIN users u1 ON s.seller_user_id = u1.id
      LEFT JOIN users u2 ON s.seller_user_id = u2.id
      WHERE s.cart_id IN (${cartIds.map(() => '?').join(',')})
        AND s.deleted_at IS NULL AND s.is_deleted = 0
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
      LEFT JOIN users u ON s.seller_user_id = u.id
      WHERE s.cash_difference_cents != 0 AND s.status = 'FINALIZED'
        AND s.deleted_at IS NULL AND s.is_deleted = 0
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

  async delete(id: string, userId: string): Promise<void> {
    const db = await this.getDb();
    const old = await this.findById(id);
    if (!old) throw new Error('Settlement not found');

    const now = Date.now();
    const nowISO = new Date().toISOString();
    const deviceId = await getDeviceId();
    
    await db.runAsync(
      'UPDATE settlements SET is_deleted = 1, deleted_at = ?, updated_at = ?, updated_at_iso = ?, device_id = ? WHERE id = ?',
      [nowISO, now, nowISO, deviceId, id]
    );

    const payload = {
      id,
      shift_id: old.shift_id,
      cart_id: old.cart_id,
      seller_user_id: (old as any).seller_user_id,
      date_iso: (old as any).date_iso,
      status: old.status,
      notes: old.notes || null,
      cash_cents: (old as any).cash_cents || 0,
      gcash_cents: (old as any).gcash_cents || 0,
      card_cents: (old as any).card_cents || 0,
      gross_sales_cents: (old as any).gross_sales_cents || 0,
      total_cents: (old as any).total_cents || 0,
      business_id: (old as any).business_id || 'default_business',
      device_id: deviceId,
      is_deleted: 1,
      deleted_at: nowISO,
      created_at: (old as any).created_at || Date.now(),
      updated_at: now,
      created_at_iso: (old as any).created_at_iso,
      updated_at_iso: nowISO,
    };

    await this.queueSync('settlements', id, payload);
    
    const items = await db.getAllAsync<SettlementItem>(
      'SELECT * FROM settlement_items WHERE settlement_id = ? AND deleted_at IS NULL AND is_deleted = 0',
      [id]
    );
    
    for (const item of items) {
      await db.runAsync(
        'UPDATE settlement_items SET is_deleted = 1, deleted_at = ?, updated_at = ?, updated_at_iso = ?, device_id = ? WHERE id = ?',
        [nowISO, now, nowISO, deviceId, item.id]
      );
      
      const itemPayload = {
        id: item.id,
        settlement_id: item.settlement_id,
        product_id: item.product_id ?? null,
        product_name: item.product_name,
        qty: item.qty,
        price_cents: item.price_cents,
        business_id: item.business_id || 'default_business',
        device_id: deviceId,
        is_deleted: 1,
        deleted_at: nowISO,
        created_at: item.created_at || Date.now(),
        updated_at: now,
        created_at_iso: item.created_at_iso,
        updated_at_iso: nowISO,
      };
      
      await this.queueSync('settlement_items', item.id, itemPayload);
      console.log('[SettlementRepo] Settlement item soft deleted:', item.id);
    }
    
    await this.auditLog(userId, 'settlements', id, 'delete', old, null);
    console.log(`[SettlementRepo] Settlement soft deleted with ${items.length} items:`, id);
  }
}
