import { WorkerLedgerEntry, WorkerLedgerEntryWithDetails, LedgerEntryType } from '../types';
import { BaseRepository } from './base';

export class LedgerRepository extends BaseRepository {
  async create(
    workerUserId: string,
    type: LedgerEntryType,
    amountCents: number,
    createdByUserId: string,
    shiftId?: string,
    notes?: string
  ): Promise<WorkerLedgerEntry> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = Date.now();

    await db.runAsync(
      `INSERT INTO worker_ledger (
        id, worker_user_id, shift_id, type, amount_cents, notes, 
        created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, workerUserId, shiftId || null, type, amountCents, notes || null, createdByUserId, now]
    );

    await this.auditLog(createdByUserId, 'worker_ledger', id, 'create', null, {
      worker_user_id: workerUserId,
      type,
      amount_cents: amountCents,
      shift_id: shiftId,
    });

    return this.findById(id) as Promise<WorkerLedgerEntry>;
  }

  async findById(id: string): Promise<WorkerLedgerEntry | null> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<WorkerLedgerEntry>(
      'SELECT * FROM worker_ledger WHERE id = ?',
      [id]
    );
    return result || null;
  }

  async findByWorkerId(workerUserId: string, limit: number = 100): Promise<WorkerLedgerEntryWithDetails[]> {
    const db = await this.getDb();
    const results = await db.getAllAsync<WorkerLedgerEntryWithDetails>(
      `SELECT 
        wl.*,
        w.name as worker_name,
        u.name as created_by_name
      FROM worker_ledger wl
      LEFT JOIN users w ON wl.worker_user_id = w.id
      LEFT JOIN users u ON wl.created_by_user_id = u.id
      WHERE wl.worker_user_id = ?
      ORDER BY wl.created_at DESC
      LIMIT ?`,
      [workerUserId, limit]
    );
    return results;
  }

  async findByShiftId(shiftId: string): Promise<WorkerLedgerEntry[]> {
    const db = await this.getDb();
    const results = await db.getAllAsync<WorkerLedgerEntry>(
      'SELECT * FROM worker_ledger WHERE shift_id = ? ORDER BY created_at DESC',
      [shiftId]
    );
    return results;
  }

  async getWorkerBalance(workerUserId: string): Promise<number> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ balance: number | null }>(
      `SELECT SUM(
        CASE 
          WHEN type IN ('WAGE', 'COMMISSION', 'BONUS') THEN amount_cents
          WHEN type IN ('ADVANCE', 'DEDUCTION') THEN -amount_cents
          ELSE amount_cents
        END
      ) as balance
      FROM worker_ledger
      WHERE worker_user_id = ?`,
      [workerUserId]
    );
    return result?.balance || 0;
  }

  async getAdvancesAndDeductionsForShift(shiftId: string): Promise<{ advances: number; deductions: number; bonuses: number }> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ advances: number | null; deductions: number | null; bonuses: number | null }>(
      `SELECT 
        SUM(CASE WHEN type = 'ADVANCE' THEN amount_cents ELSE 0 END) as advances,
        SUM(CASE WHEN type = 'DEDUCTION' THEN amount_cents ELSE 0 END) as deductions,
        SUM(CASE WHEN type = 'BONUS' THEN amount_cents ELSE 0 END) as bonuses
      FROM worker_ledger
      WHERE shift_id = ?`,
      [shiftId]
    );
    return {
      advances: result?.advances || 0,
      deductions: result?.deductions || 0,
      bonuses: result?.bonuses || 0,
    };
  }
}
