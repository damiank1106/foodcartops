import { getDatabase } from '../database/init';
import { BaseRepository } from './base';

export interface OtherExpense {
  id: string;
  date: string;
  name: string;
  amount_cents: number;
  notes?: string;
  created_by_user_id: string;
  created_at: number;
  updated_at: number;
  is_deleted: number;
}

export class OtherExpenseRepository extends BaseRepository {
  async create(data: {
    date: string;
    name: string;
    amount_cents: number;
    notes?: string;
    created_by_user_id: string;
  }): Promise<OtherExpense> {
    const db = await getDatabase();
    const now = Date.now();
    const id = this.generateId();

    await db.runAsync(
      `INSERT INTO other_expenses (id, date, name, amount_cents, notes, created_by_user_id, created_at, updated_at, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, data.date, data.name, data.amount_cents, data.notes || null, data.created_by_user_id, now, now]
    );

    await this.auditLog(data.created_by_user_id, 'other_expense', id, 'create', null, data);

    const expense = await this.findById(id);
    if (!expense) throw new Error('Failed to create other expense');

    console.log('[OtherExpenseRepo] Created other expense:', id);
    return expense;
  }

  async findById(id: string): Promise<OtherExpense | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<OtherExpense>(
      'SELECT * FROM other_expenses WHERE id = ? AND is_deleted = 0',
      [id]
    );
    return row || null;
  }

  async listByRange(dateStart: string, dateEnd: string): Promise<OtherExpense[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<OtherExpense>(
      `SELECT * FROM other_expenses 
       WHERE is_deleted = 0 AND date >= ? AND date <= ?
       ORDER BY date DESC, created_at DESC`,
      [dateStart, dateEnd]
    );
    return rows;
  }

  async update(data: {
    id: string;
    date: string;
    name: string;
    amount_cents: number;
    notes?: string;
    updated_by_user_id: string;
  }): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();

    const old = await this.findById(data.id);

    await db.runAsync(
      `UPDATE other_expenses 
       SET date = ?, name = ?, amount_cents = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [data.date, data.name, data.amount_cents, data.notes || null, now, data.id]
    );

    await this.auditLog(data.updated_by_user_id, 'other_expense', data.id, 'update', old, data);

    console.log('[OtherExpenseRepo] Updated other expense:', data.id);
  }

  async softDelete(id: string, deleted_by_user_id: string): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();

    const old = await this.findById(id);

    await db.runAsync(
      'UPDATE other_expenses SET is_deleted = 1, updated_at = ? WHERE id = ?',
      [now, id]
    );

    await this.auditLog(deleted_by_user_id, 'other_expense', id, 'delete', old, null);

    console.log('[OtherExpenseRepo] Soft deleted other expense:', id);
  }
}
