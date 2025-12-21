import { getDatabase } from '../database/init';
import type { Expense, ExpenseWithDetails, ExpenseStatus, PaidFrom } from '../types';
import { BaseRepository } from './base';

export class ExpenseRepository extends BaseRepository {
  async create(data: {
    shift_id: string | null;
    cart_id: string;
    submitted_by_user_id: string;
    category: string;
    amount_cents: number;
    paid_from: PaidFrom;
    notes?: string;
    receipt_image_uri?: string;
    status?: ExpenseStatus;
  }): Promise<Expense> {
    const db = await getDatabase();
    const now = Date.now();
    const id = this.generateId();

    await db.runAsync(
      `INSERT INTO expenses (
        id, shift_id, cart_id, submitted_by_user_id, category, 
        amount_cents, paid_from, notes, receipt_image_uri, 
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.shift_id,
        data.cart_id,
        data.submitted_by_user_id,
        data.category,
        data.amount_cents,
        data.paid_from,
        data.notes || null,
        data.receipt_image_uri || null,
        data.status || 'SUBMITTED',
        now,
        now,
      ]
    );

    const expense = await this.findById(id);
    if (!expense) throw new Error('Failed to create expense');
    
    return expense;
  }

  async findById(id: string): Promise<Expense | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<Expense>(
      'SELECT * FROM expenses WHERE id = ?',
      [id]
    );
    return row || null;
  }

  async findAll(filters?: {
    shift_id?: string;
    cart_id?: string;
    submitted_by_user_id?: string;
    status?: ExpenseStatus;
  }): Promise<Expense[]> {
    const db = await getDatabase();
    let query = 'SELECT * FROM expenses WHERE 1=1';
    const params: any[] = [];

    if (filters?.shift_id) {
      query += ' AND shift_id = ?';
      params.push(filters.shift_id);
    }

    if (filters?.cart_id) {
      query += ' AND cart_id = ?';
      params.push(filters.cart_id);
    }

    if (filters?.submitted_by_user_id) {
      query += ' AND submitted_by_user_id = ?';
      params.push(filters.submitted_by_user_id);
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY created_at DESC';

    const rows = await db.getAllAsync<Expense>(query, params);
    return rows;
  }

  async findWithDetails(filters?: {
    shift_id?: string;
    cart_id?: string;
    submitted_by_user_id?: string;
    status?: ExpenseStatus;
  }): Promise<ExpenseWithDetails[]> {
    const db = await getDatabase();
    let query = `
      SELECT 
        e.*,
        u1.name as submitted_by_name,
        u2.name as approved_by_name,
        c.name as cart_name
      FROM expenses e
      LEFT JOIN users u1 ON e.submitted_by_user_id = u1.id
      LEFT JOIN users u2 ON e.approved_by_user_id = u2.id
      LEFT JOIN carts c ON e.cart_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.shift_id) {
      query += ' AND e.shift_id = ?';
      params.push(filters.shift_id);
    }

    if (filters?.cart_id) {
      query += ' AND e.cart_id = ?';
      params.push(filters.cart_id);
    }

    if (filters?.submitted_by_user_id) {
      query += ' AND e.submitted_by_user_id = ?';
      params.push(filters.submitted_by_user_id);
    }

    if (filters?.status) {
      query += ' AND e.status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY e.created_at DESC';

    const rows = await db.getAllAsync<ExpenseWithDetails>(query, params);
    return rows;
  }

  async updateStatus(
    id: string,
    status: ExpenseStatus,
    approved_by_user_id: string
  ): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();

    await db.runAsync(
      `UPDATE expenses 
       SET status = ?, approved_by_user_id = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ?`,
      [status, approved_by_user_id, now, now, id]
    );
  }

  async getPendingCount(): Promise<number> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM expenses WHERE status = ?',
      ['SUBMITTED']
    );
    return result?.count || 0;
  }

  async getApprovedExpensesForShift(shift_id: string): Promise<Expense[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<Expense>(
      'SELECT * FROM expenses WHERE shift_id = ? AND status = ? ORDER BY created_at DESC',
      [shift_id, 'APPROVED']
    );
    return rows;
  }

  async approve(id: string, approvedByUserId: string, notes?: string): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();

    const old = await this.findById(id);

    await db.runAsync(
      `UPDATE expenses 
       SET status = 'APPROVED', approved_by_user_id = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ?`,
      [approvedByUserId, now, now, id]
    );

    await this.auditLog(approvedByUserId, 'expenses', id, 'approve', old, {
      status: 'APPROVED',
      notes,
    });
  }

  async reject(id: string, rejectedByUserId: string, notes?: string): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();

    const old = await this.findById(id);

    await db.runAsync(
      `UPDATE expenses 
       SET status = 'REJECTED', approved_by_user_id = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ?`,
      [rejectedByUserId, now, now, id]
    );

    await this.auditLog(rejectedByUserId, 'expenses', id, 'reject', old, {
      status: 'REJECTED',
      notes,
    });
  }

  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
  }
}
