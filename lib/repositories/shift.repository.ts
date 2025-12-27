import { BaseRepository } from './base';
import { WorkerShift, ShiftEvent } from '../types';

export class ShiftRepository extends BaseRepository {
  async createAssignedShift(
    worker_id: string,
    cart_id: string,
    starting_cash_cents: number | null,
    notes?: string
  ): Promise<WorkerShift> {
    const db = await this.getDb();
    
    const id = this.generateId();
    const now = this.now();

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
        expected_cash_cents, notes, status, created_at, updated_at
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ]
    );

    await this.addShiftEvent(shift.id, 'shift_assigned', {
      cart_id,
      starting_cash_cents,
      notes,
    });

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

      const shift = await db.getFirstAsync<WorkerShift>(
        'SELECT * FROM worker_shifts WHERE id = ?',
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
         SET status = 'active', clock_in = ?, starting_cash_cents = ?, expected_cash_cents = ?, updated_at = ? 
         WHERE id = ?`,
        [now, cash, cash, now, shift_id]
      );

      await this.addShiftEvent(shift_id, 'shift_started', {
        starting_cash_cents: cash,
      });

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
        expected_cash_cents, notes, status, created_at, updated_at
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ]
    );

    await this.addShiftEvent(shift.id, 'shift_started', {
      cart_id,
      starting_cash_cents: cash,
      notes,
    });

    console.log('[ShiftRepo] Shift started:', shift.id);
    return shift;
  }

  async endShift(shift_id: string, notes?: string): Promise<void> {
    const db = await this.getDb();
    const now = this.now();

    const shift = await db.getFirstAsync<WorkerShift>(
      'SELECT * FROM worker_shifts WHERE id = ?',
      [shift_id]
    );

    if (!shift) {
      throw new Error('Shift not found');
    }

    await db.runAsync(
      `UPDATE worker_shifts 
       SET clock_out = ?, status = 'ended', notes = ?, updated_at = ? 
       WHERE id = ?`,
      [now, notes || shift.notes || null, now, shift_id]
    );

    await this.addShiftEvent(shift_id, 'shift_ended', {
      clock_out: now,
      notes,
    });

    console.log('[ShiftRepo] Shift ended:', shift_id);
  }

  async getActiveShift(worker_id: string): Promise<WorkerShift | null> {
    const db = await this.getDb();
    const shift = await db.getFirstAsync<WorkerShift>(
      "SELECT * FROM worker_shifts WHERE worker_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
      [worker_id]
    );
    return shift || null;
  }

  async getActiveShifts(): Promise<(WorkerShift & { worker_name: string })[]> {
    const db = await this.getDb();
    return await db.getAllAsync<WorkerShift & { worker_name: string }>(
      "SELECT ws.*, u.name as worker_name FROM worker_shifts ws JOIN users u ON ws.worker_id = u.id WHERE ws.status = 'active' ORDER BY ws.created_at DESC"
    );
  }

  async getLastCompletedShift(): Promise<(WorkerShift & { worker_name: string }) | null> {
    const db = await this.getDb();
    const shift = await db.getFirstAsync<WorkerShift & { worker_name: string }>(
      "SELECT ws.*, u.name as worker_name FROM worker_shifts ws JOIN users u ON ws.worker_id = u.id WHERE ws.status = 'ended' AND ws.clock_out IS NOT NULL ORDER BY ws.clock_out DESC LIMIT 1"
    );
    return shift || null;
  }

  async getAssignedShifts(worker_id: string): Promise<WorkerShift[]> {
    const db = await this.getDb();
    return await db.getAllAsync<WorkerShift>(
      "SELECT * FROM worker_shifts WHERE worker_id = ? AND status = 'assigned' ORDER BY created_at DESC",
      [worker_id]
    );
  }

  async getShiftById(shift_id: string): Promise<WorkerShift | null> {
    const db = await this.getDb();
    const shift = await db.getFirstAsync<WorkerShift>(
      'SELECT * FROM worker_shifts WHERE id = ?',
      [shift_id]
    );
    return shift || null;
  }

  async getShifts(worker_id?: string, cart_id?: string): Promise<WorkerShift[]> {
    const db = await this.getDb();
    const conditions: string[] = ['1=1'];
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
      "SELECT COUNT(DISTINCT worker_id) as count FROM worker_shifts WHERE status = 'active'"
    );
    return result?.count || 0;
  }

  async updateExpectedCash(shift_id: string, expected_cash_cents: number): Promise<void> {
    const db = await this.getDb();
    const now = this.now();

    await db.runAsync(
      'UPDATE worker_shifts SET expected_cash_cents = ?, updated_at = ? WHERE id = ?',
      [expected_cash_cents, now, shift_id]
    );

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
    await db.runAsync('DELETE FROM shift_events WHERE shift_id = ?', [shift_id]);
    await db.runAsync('DELETE FROM worker_shifts WHERE id = ?', [shift_id]);
    console.log('[ShiftRepo] Shift deleted:', shift_id);
  }
}
