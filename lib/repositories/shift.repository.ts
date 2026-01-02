import { BaseRepository } from './base';
import { WorkerShift, ShiftEvent } from '../types';
import { getDeviceId } from '../utils/device-id';
import { SyncOutboxRepository } from './sync-outbox.repository';

export class ShiftRepository extends BaseRepository {
  private syncOutbox = new SyncOutboxRepository();
  async createAssignedShift(
    worker_id: string,
    cart_id: string,
    starting_cash_cents: number | null,
    notes?: string
  ): Promise<WorkerShift> {
    const db = await this.getDb();
    
    const id = this.generateId();
    const now = this.now();
    const nowISO = new Date().toISOString();
    const deviceId = await getDeviceId();

    const shift: WorkerShift = {
      id,
      worker_id,
      cart_id,
      clock_in: null as any,
      starting_cash_cents: null as any,
      expected_cash_cents: 0,
      notes,
      status: 'assigned',
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO worker_shifts (
        id, worker_id, cart_id, clock_in, starting_cash_cents, 
        expected_cash_cents, notes, status, created_at, updated_at,
        business_id, device_id, created_at_iso, updated_at_iso
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shift.id,
        shift.worker_id,
        shift.cart_id,
        null,
        null,
        shift.expected_cash_cents,
        shift.notes || null,
        shift.status,
        shift.created_at,
        shift.updated_at,
        'default_business',
        deviceId,
        nowISO,
        nowISO,
      ]
    );

    await this.addShiftEvent(shift.id, 'shift_assigned', {
      cart_id,
      starting_cash_cents,
      notes,
    });

    const createdShift = await this.getShiftById(id);
    if (createdShift) {
      await this.syncOutbox.add('worker_shifts', id, 'upsert', createdShift);
    }

    console.log('[ShiftRepo] Shift assigned (inactive):', shift.id);
    return shift;
  }

  async startShift(
    worker_id: string,
    cart_id: string,
    starting_cash_cents: number,
    notes?: string
  ): Promise<WorkerShift>;
  async startShift(shift_id: string, starting_cash_cents: number): Promise<void>;
  async startShift(
    worker_or_shift_id: string,
    cart_id_or_cash: string | number,
    starting_cash_cents?: number,
    notes?: string
  ): Promise<WorkerShift | void> {
    const db = await this.getDb();
    
    if (typeof cart_id_or_cash === 'number') {
      const shift_id = worker_or_shift_id;
      const cash = cart_id_or_cash;
      const now = this.now();
      const nowISO = new Date().toISOString();

      const shift = await db.getFirstAsync<WorkerShift>(
        'SELECT * FROM worker_shifts WHERE id = ? AND is_deleted = 0 AND deleted_at IS NULL',
        [shift_id]
      );

      if (!shift) {
        throw new Error('Shift not found');
      }

      if (shift.status === 'active') {
        throw new Error('Shift is already active');
      }

      await db.runAsync(
        `UPDATE worker_shifts 
         SET status = 'active', clock_in = ?, starting_cash_cents = ?, expected_cash_cents = ?, updated_at = ?, updated_at_iso = ? 
         WHERE id = ?`,
        [now, cash, cash, now, nowISO, shift_id]
      );

      await this.addShiftEvent(shift_id, 'shift_started', {
        starting_cash_cents: cash,
      });

      const updatedShift = await this.getShiftById(shift_id);
      if (updatedShift) {
        await this.syncOutbox.add('worker_shifts', shift_id, 'upsert', updatedShift);
      }

      console.log('[ShiftRepo] Shift started:', shift_id);
      return;
    }
    
    const worker_id = worker_or_shift_id;
    const cart_id = cart_id_or_cash as string;
    const cash = starting_cash_cents!;
    
    const existingActive = await this.getActiveShift(worker_id);
    if (existingActive) {
      console.log('[ShiftRepo] Worker already has an active shift:', existingActive.id);
      throw new Error('Worker already has an active shift');
    }
    
    const id = this.generateId();
    const now = this.now();
    const nowISO = new Date().toISOString();
    const deviceId = await getDeviceId();

    const shift: WorkerShift = {
      id,
      worker_id,
      cart_id,
      clock_in: now,
      starting_cash_cents: cash,
      expected_cash_cents: cash,
      notes,
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO worker_shifts (
        id, worker_id, cart_id, clock_in, starting_cash_cents, 
        expected_cash_cents, notes, status, created_at, updated_at,
        business_id, device_id, created_at_iso, updated_at_iso
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shift.id,
        shift.worker_id,
        shift.cart_id,
        shift.clock_in,
        shift.starting_cash_cents,
        shift.expected_cash_cents,
        shift.notes || null,
        shift.status,
        shift.created_at,
        shift.updated_at,
        'default_business',
        deviceId,
        nowISO,
        nowISO,
      ]
    );

    await this.addShiftEvent(shift.id, 'shift_started', {
      cart_id,
      starting_cash_cents: cash,
      notes,
    });

    const createdShift = await this.getShiftById(id);
    if (createdShift) {
      await this.syncOutbox.add('worker_shifts', id, 'upsert', createdShift);
    }

    console.log('[ShiftRepo] Shift started:', shift.id);
    return shift;
  }

  async endShift(shift_id: string, notes?: string): Promise<void> {
    const db = await this.getDb();
    const now = this.now();
    const nowISO = new Date().toISOString();

    const shift = await db.getFirstAsync<WorkerShift>(
      'SELECT * FROM worker_shifts WHERE id = ? AND is_deleted = 0 AND deleted_at IS NULL',
      [shift_id]
    );

    if (!shift) {
      throw new Error('Shift not found');
    }

    await db.runAsync(
      `UPDATE worker_shifts 
       SET clock_out = ?, status = 'ended', notes = ?, updated_at = ?, updated_at_iso = ? 
       WHERE id = ?`,
      [now, notes || shift.notes || null, now, nowISO, shift_id]
    );

    await this.addShiftEvent(shift_id, 'shift_ended', {
      clock_out: now,
      notes,
    });

    const updatedShift = await this.getShiftById(shift_id);
    if (updatedShift) {
      await this.syncOutbox.add('worker_shifts', shift_id, 'upsert', updatedShift, {
        changeId: shift_id,
        changeType: 'SHIFT_END',
      });
    }

    await this.createSettlementForShift(shift_id, shift.worker_id, shift.cart_id, now);

    console.log('[ShiftRepo] Shift ended:', shift_id);
  }

  private async createSettlementForShift(
    shiftId: string,
    workerId: string,
    cartId: string,
    clockOut: number
  ): Promise<void> {
    try {
      const { SettlementRepository } = require('./settlement.repository');
      const { SaleRepository } = require('./sale.repository');
      const { PaymentRepository } = require('./payment.repository');
      const settlementRepo = new SettlementRepository();
      const saleRepo = new SaleRepository();
      const paymentRepo = new PaymentRepository();

      const existingSettlement = await settlementRepo.findByShiftId(shiftId);
      if (existingSettlement) {
        console.log('[ShiftRepo] Settlement already exists for shift:', shiftId);
        return;
      }

      const sales = (await saleRepo.findAll()).filter(sale => sale.shift_id === shiftId);
      
      const payments = await Promise.all(
        sales.map(sale => paymentRepo.findBySaleId(sale.id))
      );
      const flatPayments = payments.flat();

      const cashCents = flatPayments
        .filter(p => p.method === 'CASH')
        .reduce((sum, p) => sum + p.amount_cents, 0);
      const gcashCents = flatPayments
        .filter(p => p.method === 'GCASH')
        .reduce((sum, p) => sum + p.amount_cents, 0);
      const cardCents = flatPayments
        .filter(p => p.method === 'CARD')
        .reduce((sum, p) => sum + p.amount_cents, 0);
      const totalSalesCents = sales.reduce((sum, sale) => sum + sale.total_cents, 0);

      const dateIso = new Date(clockOut).toISOString().split('T')[0];

      const settlement = await settlementRepo.create(
        shiftId,
        cartId,
        workerId,
        dateIso,
        'SAVED',
        undefined,
        cashCents,
        gcashCents,
        cardCents,
        totalSalesCents,
        totalSalesCents,
        workerId
      );

      const db = await this.getDb();
      const saleItems = await db.getAllAsync<any>(
        `SELECT si.*, p.name as product_name 
         FROM sale_items si 
         LEFT JOIN products p ON si.product_id = p.id 
         WHERE si.sale_id IN (${sales.map(() => '?').join(',')})`,
        sales.map(s => s.id)
      );

      const productsSold = saleItems.reduce((acc: any[], item: any) => {
        const existing = acc.find(p => p.product_id === item.product_id);
        if (existing) {
          existing.quantity += item.quantity;
          existing.total_cents += item.line_total_cents;
        } else {
          acc.push({
            product_id: item.product_id,
            product_name: item.product_name || 'Unknown Product',
            quantity: item.quantity,
            total_cents: item.line_total_cents,
          });
        }
        return acc;
      }, []);

      for (const product of productsSold) {
        await settlementRepo.createSettlementItem(
          settlement.id,
          product.product_id,
          product.product_name,
          product.quantity,
          product.total_cents,
          workerId
        );
      }

      console.log('[ShiftRepo] Created settlement for shift:', shiftId, 'settlement:', settlement.id);
    } catch (error) {
      console.error('[ShiftRepo] Failed to create settlement for shift:', shiftId, error);
    }
  }

  async getActiveShift(worker_id: string): Promise<WorkerShift | null> {
    const db = await this.getDb();
    const shift = await db.getFirstAsync<WorkerShift>(
      "SELECT * FROM worker_shifts WHERE worker_id = ? AND status = 'active' AND is_deleted = 0 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
      [worker_id]
    );
    return shift || null;
  }

  async getActiveShifts(): Promise<(WorkerShift & { worker_name: string })[]> {
    const db = await this.getDb();
    return await db.getAllAsync<WorkerShift & { worker_name: string }>(
      "SELECT ws.*, u.name as worker_name FROM worker_shifts ws JOIN users u ON ws.worker_id = u.id WHERE ws.status = 'active' AND ws.is_deleted = 0 AND ws.deleted_at IS NULL ORDER BY ws.created_at DESC"
    );
  }

  async getLastCompletedShift(): Promise<(WorkerShift & { worker_name: string }) | null> {
    const db = await this.getDb();
    const shift = await db.getFirstAsync<WorkerShift & { worker_name: string }>(
      "SELECT ws.*, u.name as worker_name FROM worker_shifts ws JOIN users u ON ws.worker_id = u.id WHERE ws.status = 'ended' AND ws.clock_out IS NOT NULL AND ws.is_deleted = 0 AND ws.deleted_at IS NULL ORDER BY ws.clock_out DESC LIMIT 1"
    );
    return shift || null;
  }

  async getAssignedShifts(worker_id: string): Promise<WorkerShift[]> {
    const db = await this.getDb();
    return await db.getAllAsync<WorkerShift>(
      "SELECT * FROM worker_shifts WHERE worker_id = ? AND status = 'assigned' AND is_deleted = 0 AND deleted_at IS NULL ORDER BY created_at DESC",
      [worker_id]
    );
  }

  async getShiftById(shift_id: string): Promise<WorkerShift | null> {
    const db = await this.getDb();
    const shift = await db.getFirstAsync<WorkerShift>(
      'SELECT * FROM worker_shifts WHERE id = ? AND is_deleted = 0 AND deleted_at IS NULL',
      [shift_id]
    );
    return shift || null;
  }

  async getShifts(worker_id?: string, cart_id?: string): Promise<WorkerShift[]> {
    const db = await this.getDb();
    const conditions: string[] = ['is_deleted = 0', 'deleted_at IS NULL'];
    const params: any[] = [];

    if (worker_id) {
      conditions.push('worker_id = ?');
      params.push(worker_id);
    }

    if (cart_id) {
      conditions.push('cart_id = ?');
      params.push(cart_id);
    }

    return await db.getAllAsync<WorkerShift>(
      `SELECT * FROM worker_shifts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
  }

  async getActiveWorkerCount(): Promise<number> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(DISTINCT worker_id) as count FROM worker_shifts WHERE status = 'active' AND is_deleted = 0 AND deleted_at IS NULL"
    );
    return result?.count || 0;
  }

  async updateExpectedCash(shift_id: string, expected_cash_cents: number): Promise<void> {
    const db = await this.getDb();
    const now = this.now();
    const nowISO = new Date().toISOString();

    await db.runAsync(
      'UPDATE worker_shifts SET expected_cash_cents = ?, updated_at = ?, updated_at_iso = ? WHERE id = ?',
      [expected_cash_cents, now, nowISO, shift_id]
    );

    const updatedShift = await this.getShiftById(shift_id);
    if (updatedShift) {
      await this.syncOutbox.add('worker_shifts', shift_id, 'upsert', updatedShift);
    }

    console.log('[ShiftRepo] Updated expected cash for shift:', shift_id);
  }

  async addShiftEvent(
    shift_id: string,
    type: string,
    payload?: Record<string, any>
  ): Promise<ShiftEvent> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const event: ShiftEvent = {
      id,
      shift_id,
      type,
      payload_json: payload ? JSON.stringify(payload) : undefined,
      created_at: now,
    };

    await db.runAsync(
      'INSERT INTO shift_events (id, shift_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
      [event.id, event.shift_id, event.type, event.payload_json || null, event.created_at]
    );

    console.log('[ShiftRepo] Added shift event:', type, 'for shift:', shift_id);
    return event;
  }

  async getShiftEvents(shift_id: string): Promise<ShiftEvent[]> {
    const db = await this.getDb();
    return await db.getAllAsync<ShiftEvent>(
      'SELECT * FROM shift_events WHERE shift_id = ? ORDER BY created_at ASC',
      [shift_id]
    );
  }

  async getShiftTimeline(shift_id: string): Promise<{
      type: string;
      timestamp: number;
      data?: any;
    }[]> {
    const events = await this.getShiftEvents(shift_id);
    return events.map((event) => ({
      type: event.type,
      timestamp: event.created_at,
      data: event.payload_json ? JSON.parse(event.payload_json) : undefined,
    }));
  }

  async deleteShift(shift_id: string): Promise<void> {
    const db = await this.getDb();
    const now = this.now();
    const nowISO = new Date().toISOString();
    const deviceId = await getDeviceId();

    const shift = await db.getFirstAsync<WorkerShift>(
      'SELECT * FROM worker_shifts WHERE id = ?',
      [shift_id]
    );

    if (!shift) {
      console.log('[ShiftRepo] Shift not found for deletion:', shift_id);
      return;
    }

    await db.runAsync(
      'UPDATE worker_shifts SET is_deleted = 1, deleted_at = ?, updated_at = ?, updated_at_iso = ? WHERE id = ?',
      [nowISO, now, nowISO, shift_id]
    );

    const deletedShift = {
      ...shift,
      is_deleted: 1,
      deleted_at: nowISO,
      updated_at: now,
      updated_at_iso: nowISO,
      business_id: 'default_business',
      device_id: deviceId,
    };

    await this.syncOutbox.add('worker_shifts', shift_id, 'upsert', deletedShift);

    console.log('[ShiftRepo] Shift soft deleted:', shift_id);
  }
}
