import { BaseRepository } from './base';
import { Sale, SaleItem, SaleWithItems, PaymentMethod } from '../types';
import { ShiftRepository } from './shift.repository';
import { startOfDay, endOfDay } from 'date-fns';

export class SaleRepository extends BaseRepository {
  async create(data: {
    cart_id: string;
    worker_id: string;
    total_amount: number;
    payment_method: PaymentMethod;
    notes?: string;
    receipt_photo?: string;
    items: {
      product_id: string;
      quantity: number;
      unit_price: number;
    }[];
    shift_id?: string;
  }): Promise<Sale> {
    const db = await this.getDb();
    const saleId = this.generateId();
    const now = this.now();

    const sale: Sale = {
      id: saleId,
      cart_id: data.cart_id,
      worker_id: data.worker_id,
      total_amount: data.total_amount,
      payment_method: data.payment_method,
      notes: data.notes,
      receipt_photo: data.receipt_photo,
      created_at: now,
    };

    await db.runAsync(
      `INSERT INTO sales (id, cart_id, worker_id, total_amount, payment_method, notes, receipt_photo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sale.id, sale.cart_id, sale.worker_id, sale.total_amount, sale.payment_method, sale.notes || null, sale.receipt_photo || null, sale.created_at]
    );

    for (const item of data.items) {
      const itemId = this.generateId();
      const totalPrice = item.quantity * item.unit_price;

      await db.runAsync(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [itemId, saleId, item.product_id, item.quantity, item.unit_price, totalPrice, now]
      );
    }

    if (data.shift_id) {
      const shiftRepo = new ShiftRepository();
      await shiftRepo.addShiftEvent(data.shift_id, 'sale_completed', {
        sale_id: saleId,
        total_amount: data.total_amount,
        payment_method: data.payment_method,
        items_count: data.items.length,
      });

      const totalCashSales = data.payment_method === 'cash' ? data.total_amount : 0;
      const shift = await shiftRepo.getShiftById(data.shift_id);
      if (shift) {
        const newExpectedCash = shift.starting_cash_cents + (totalCashSales * 100);
        await shiftRepo.updateExpectedCash(data.shift_id, newExpectedCash);
      }
    }

    console.log('[SaleRepo] Created sale:', sale.id);
    return sale;
  }

  async findById(id: string): Promise<SaleWithItems | null> {
    const db = await this.getDb();
    
    const sale = await db.getFirstAsync<Sale & { worker_name: string; cart_name: string }>(
      `SELECT s.*, u.name as worker_name, c.name as cart_name
       FROM sales s
       JOIN users u ON s.worker_id = u.id
       JOIN carts c ON s.cart_id = c.id
       WHERE s.id = ?`,
      [id]
    );

    if (!sale) return null;

    const items = await db.getAllAsync<SaleItem & { product_name: string }>(
      `SELECT si.*, p.name as product_name
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = ?`,
      [id]
    );

    return { ...sale, items };
  }

  async findAll(options?: {
    cart_id?: string;
    worker_id?: string;
    start_date?: Date;
    end_date?: Date;
  }): Promise<SaleWithItems[]> {
    const db = await this.getDb();
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (options?.cart_id) {
      conditions.push('s.cart_id = ?');
      params.push(options.cart_id);
    }

    if (options?.worker_id) {
      conditions.push('s.worker_id = ?');
      params.push(options.worker_id);
    }

    if (options?.start_date) {
      conditions.push('s.created_at >= ?');
      params.push(options.start_date.getTime());
    }

    if (options?.end_date) {
      conditions.push('s.created_at <= ?');
      params.push(options.end_date.getTime());
    }

    const sales = await db.getAllAsync<Sale & { worker_name: string; cart_name: string }>(
      `SELECT s.*, u.name as worker_name, c.name as cart_name
       FROM sales s
       JOIN users u ON s.worker_id = u.id
       JOIN carts c ON s.cart_id = c.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.created_at DESC`,
      params
    );

    const salesWithItems: SaleWithItems[] = [];

    for (const sale of sales) {
      const items = await db.getAllAsync<SaleItem & { product_name: string }>(
        `SELECT si.*, p.name as product_name
         FROM sale_items si
         JOIN products p ON si.product_id = p.id
         WHERE si.sale_id = ?`,
        [sale.id]
      );

      salesWithItems.push({ ...sale, items });
    }

    return salesWithItems;
  }

  async getTodaySales(): Promise<SaleWithItems[]> {
    const today = new Date();
    return this.findAll({
      start_date: startOfDay(today),
      end_date: endOfDay(today),
    });
  }

  async getTotalRevenue(options?: {
    cart_id?: string;
    start_date?: Date;
    end_date?: Date;
  }): Promise<number> {
    const db = await this.getDb();
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (options?.cart_id) {
      conditions.push('cart_id = ?');
      params.push(options.cart_id);
    }

    if (options?.start_date) {
      conditions.push('created_at >= ?');
      params.push(options.start_date.getTime());
    }

    if (options?.end_date) {
      conditions.push('created_at <= ?');
      params.push(options.end_date.getTime());
    }

    const result = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM sales
       WHERE ${conditions.join(' AND ')}`,
      params
    );

    return result?.total || 0;
  }
}
