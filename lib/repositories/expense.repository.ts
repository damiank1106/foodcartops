import { getDatabase } from '../database/init';
import type { Expense, ExpenseWithDetails, ExpenseStatus, PaidFrom } from '../types';
import { BaseRepository } from './base';
import { getDeviceId } from '../utils/device-id';
import { SyncOutboxRepository } from './sync-outbox.repository';

export class ExpenseRepository extends BaseRepository {
  private syncOutbox = new SyncOutboxRepository();
  async create(data: {
    shift_id: string | null;
    cart_id: string;
    submitted_by_user_id: string;
    category: string;
    amount_cents: number;
    paid_from: PaidFrom;
    notes?: string;
    receipt_image_uri?: string;
    receipt_storage_path?: string;
    status?: ExpenseStatus;
  }): Promise<Expense> {
    const db = await getDatabase();
    const now = Date.now();
    const nowISO = new Date().toISOString();
    const id = this.generateId();
    const deviceId = await getDeviceId();

    await db.runAsync(
      `INSERT INTO expenses (
        id, shift_id, cart_id, submitted_by_user_id, category, 
        amount_cents, paid_from, notes, receipt_image_uri, receipt_storage_path,
        status, created_at, updated_at, business_id, device_id, created_at_iso, updated_at_iso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        data.receipt_storage_path || null,
        data.status || 'SUBMITTED',
        now,
        now,
        'default_business',
        deviceId,
        nowISO,
        nowISO,
      ]
    );

    const expense = await this.findById(id);
    if (!expense) throw new Error('Failed to create expense');
    
    await this.syncOutbox.add('expenses', id, 'upsert', expense);
    
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
    let query = 'SELECT * FROM expenses WHERE is_deleted = 0 AND deleted_at IS NULL';
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
      WHERE e.is_deleted = 0 AND e.deleted_at IS NULL
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
    const nowISO = new Date().toISOString();

    await db.runAsync(
      `UPDATE expenses 
       SET status = ?, approved_by_user_id = ?, reviewed_at = ?, updated_at = ?, updated_at_iso = ?
       WHERE id = ?`,
      [status, approved_by_user_id, now, now, nowISO, id]
    );

    const expense = await this.findById(id);
    if (expense) {
      await this.syncOutbox.add('expenses', id, 'upsert', expense);
    }
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
    const nowISO = new Date().toISOString();

    const old = await this.findById(id);

    await db.runAsync(
      `UPDATE expenses 
       SET status = 'APPROVED', approved_by_user_id = ?, reviewed_at = ?, updated_at = ?, updated_at_iso = ?
       WHERE id = ?`,
      [approvedByUserId, now, now, nowISO, id]
    );

    await this.auditLog(approvedByUserId, 'expenses', id, 'approve', old, {
      status: 'APPROVED',
      notes,
    });

    const expense = await this.findById(id);
    if (expense) {
      await this.syncOutbox.add('expenses', id, 'upsert', expense);
    }
  }

  async reject(id: string, rejectedByUserId: string, notes?: string): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();
    const nowISO = new Date().toISOString();

    const old = await this.findById(id);

    await db.runAsync(
      `UPDATE expenses 
       SET status = 'REJECTED', approved_by_user_id = ?, reviewed_at = ?, updated_at = ?, updated_at_iso = ?
       WHERE id = ?`,
      [rejectedByUserId, now, now, nowISO, id]
    );

    await this.auditLog(rejectedByUserId, 'expenses', id, 'reject', old, {
      status: 'REJECTED',
      notes,
    });

    const expense = await this.findById(id);
    if (expense) {
      await this.syncOutbox.add('expenses', id, 'upsert', expense);
    }
  }



  async softDelete(id: string, deletedByUserId: string): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();
    const nowISO = new Date().toISOString();
    const deviceId = await getDeviceId();
    
    const oldExpense = await db.getFirstAsync<Expense>(
      'SELECT * FROM expenses WHERE id = ?',
      [id]
    );
    
    await db.runAsync(
      'UPDATE expenses SET is_deleted = 1, deleted_at = ?, updated_at = ?, updated_at_iso = ?, device_id = ? WHERE id = ?',
      [nowISO, now, nowISO, deviceId, id]
    );

    await this.auditLog(deletedByUserId, 'expense', id, 'delete', oldExpense, null);
    
    const deletedExpense = await db.getFirstAsync<Expense>(
      'SELECT * FROM expenses WHERE id = ?',
      [id]
    );
    
    if (deletedExpense) {
      await this.syncOutbox.add('expenses', id, 'upsert', deletedExpense);
      console.log('[ExpenseRepo] Soft deleted expense and queued sync:', {
        id,
        is_deleted: deletedExpense.is_deleted,
        deleted_at: deletedExpense.deleted_at,
        business_id: deletedExpense.business_id,
        device_id: deletedExpense.device_id
      });
    }
  }
}
