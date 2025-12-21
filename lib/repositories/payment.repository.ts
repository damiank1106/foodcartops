import { BaseRepository } from './base';
import { Payment, PaymentMethod } from '../types';

export class PaymentRepository extends BaseRepository {
  async create(data: {
    sale_id: string;
    method: PaymentMethod;
    amount_cents: number;
  }): Promise<Payment> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const payment: Payment = {
      id,
      sale_id: data.sale_id,
      method: data.method,
      amount_cents: data.amount_cents,
      created_at: now,
    };

    await db.runAsync(
      `INSERT INTO payments (id, sale_id, method, amount_cents, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [payment.id, payment.sale_id, payment.method, payment.amount_cents, payment.created_at]
    );

    console.log('[PaymentRepo] Created payment:', payment.id);
    return payment;
  }

  async findBySaleId(saleId: string): Promise<Payment[]> {
    const db = await this.getDb();
    return await db.getAllAsync<Payment>(
      'SELECT * FROM payments WHERE sale_id = ? ORDER BY created_at ASC',
      [saleId]
    );
  }

  async getTotalBySaleId(saleId: string): Promise<number> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments WHERE sale_id = ?',
      [saleId]
    );
    return result?.total || 0;
  }

  async getPaymentsByMethod(
    method: PaymentMethod,
    options?: {
      start_date?: Date;
      end_date?: Date;
    }
  ): Promise<Payment[]> {
    const db = await this.getDb();
    const conditions: string[] = ['p.method = ?'];
    const params: any[] = [method];

    if (options?.start_date) {
      conditions.push('p.created_at >= ?');
      params.push(options.start_date.getTime());
    }

    if (options?.end_date) {
      conditions.push('p.created_at <= ?');
      params.push(options.end_date.getTime());
    }

    return await db.getAllAsync<Payment>(
      `SELECT p.* FROM payments p WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC`,
      params
    );
  }
}
