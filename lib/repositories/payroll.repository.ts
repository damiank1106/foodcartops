import { PayrollRule } from '../types';
import { BaseRepository } from './base';

export class PayrollRepository extends BaseRepository {
  async create(
    workerUserId: string,
    baseDailyCents: number,
    commissionType: 'NONE' | 'PERCENT_OF_SALES' | 'PERCENT_OF_PROFIT',
    commissionRateBps: number,
    createdByUserId: string
  ): Promise<PayrollRule> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = Date.now();

    await db.runAsync(
      `INSERT INTO payroll_rules (
        id, worker_user_id, base_daily_cents, commission_type, 
        commission_rate_bps, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, workerUserId, baseDailyCents, commissionType, commissionRateBps, now, now]
    );

    await this.auditLog(createdByUserId, 'payroll_rules', id, 'create', null, {
      worker_user_id: workerUserId,
      base_daily_cents: baseDailyCents,
      commission_type: commissionType,
      commission_rate_bps: commissionRateBps,
    });

    return this.findById(id) as Promise<PayrollRule>;
  }

  async findById(id: string): Promise<PayrollRule | null> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<PayrollRule>(
      'SELECT * FROM payroll_rules WHERE id = ?',
      [id]
    );
    return result || null;
  }

  async findActiveByWorkerId(workerUserId: string): Promise<PayrollRule | null> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<PayrollRule>(
      'SELECT * FROM payroll_rules WHERE worker_user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
      [workerUserId]
    );
    return result || null;
  }

  async update(
    id: string,
    baseDailyCents: number,
    commissionType: 'NONE' | 'PERCENT_OF_SALES' | 'PERCENT_OF_PROFIT',
    commissionRateBps: number,
    updatedByUserId: string
  ): Promise<void> {
    const db = await this.getDb();
    const now = Date.now();

    const old = await this.findById(id);

    await db.runAsync(
      `UPDATE payroll_rules 
       SET base_daily_cents = ?, commission_type = ?, commission_rate_bps = ?, updated_at = ?
       WHERE id = ?`,
      [baseDailyCents, commissionType, commissionRateBps, now, id]
    );

    await this.auditLog(updatedByUserId, 'payroll_rules', id, 'update', old, {
      base_daily_cents: baseDailyCents,
      commission_type: commissionType,
      commission_rate_bps: commissionRateBps,
    });
  }

  async deactivate(id: string, deactivatedByUserId: string): Promise<void> {
    const db = await this.getDb();
    const now = Date.now();

    const old = await this.findById(id);

    await db.runAsync(
      'UPDATE payroll_rules SET is_active = 0, updated_at = ? WHERE id = ?',
      [now, id]
    );

    await this.auditLog(deactivatedByUserId, 'payroll_rules', id, 'update', old, {
      is_active: 0,
    });
  }
}
