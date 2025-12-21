import { BaseRepository } from './base';
import { WorkerShift } from '../types';

export class ShiftRepository extends BaseRepository {
  async clockIn(worker_id: string, cart_id: string): Promise<WorkerShift> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const shift: WorkerShift = {
      id,
      worker_id,
      cart_id,
      clock_in: now,
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO worker_shifts (id, worker_id, cart_id, clock_in, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [shift.id, shift.worker_id, shift.cart_id, shift.clock_in, shift.created_at, shift.updated_at]
    );

    console.log('[ShiftRepo] Clocked in:', shift.id);
    return shift;
  }

  async clockOut(shift_id: string): Promise<void> {
    const db = await this.getDb();
    const now = this.now();

    await db.runAsync(
      `UPDATE worker_shifts SET clock_out = ?, updated_at = ? WHERE id = ?`,
      [now, now, shift_id]
    );

    console.log('[ShiftRepo] Clocked out:', shift_id);
  }

  async getActiveShift(worker_id: string): Promise<WorkerShift | null> {
    const db = await this.getDb();
    const shift = await db.getFirstAsync<WorkerShift>(
      'SELECT * FROM worker_shifts WHERE worker_id = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1',
      [worker_id]
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
      `SELECT * FROM worker_shifts WHERE ${conditions.join(' AND ')} ORDER BY clock_in DESC`,
      params
    );
  }

  async getActiveWorkerCount(): Promise<number> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(DISTINCT worker_id) as count FROM worker_shifts WHERE clock_out IS NULL'
    );
    return result?.count || 0;
  }
}
