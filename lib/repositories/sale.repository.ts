import { BaseRepository } from './base';
import { Sale, SaleItem, SaleWithItems, PaymentMethod, Payment } from '../types';
import { ShiftRepository } from './shift.repository';
import { PaymentRepository } from './payment.repository';
import { startOfDay, endOfDay } from 'date-fns';

export class SaleRepository extends BaseRepository {
  async create(data: {
    cart_id: string;
    worker_id: string;
    items: {
      product_id: string;
      quantity: number;
      unit_price_cents: number;
    }[];
    payments: {
      method: PaymentMethod;
      amount_cents: number;
    }[];
    discount_cents?: number;
    notes?: string;
    receipt_photo?: string;
    shift_id?: string;
  }): Promise<SaleWithItems> {
    const db = await this.getDb();
    const saleId = this.generateId();
    const now = this.now();

    const subtotal_cents = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price_cents,
      0
    );
    const discount_cents = data.discount_cents || 0;
    const total_cents = subtotal_cents - discount_cents;

    const total_amount = total_cents / 100;

    const sale: Sale = {
      id: saleId,
      cart_id: data.cart_id,
      worker_id: data.worker_id,
      shift_id: data.shift_id,
      total_amount,
      subtotal_cents,
      discount_cents,
      total_cents,
      notes: data.notes,
      receipt_photo: data.receipt_photo,
      created_at: now,
    };

    await db.runAsync(
      `INSERT INTO sales (id, cart_id, worker_id, shift_id, total_amount, subtotal_cents, discount_cents, total_cents, notes, receipt_photo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sale.id,
        sale.cart_id,
        sale.worker_id,
        sale.shift_id || null,
        sale.total_amount,
        sale.subtotal_cents,
        sale.discount_cents,
        sale.total_cents,
        sale.notes || null,
        sale.receipt_photo || null,
        sale.created_at,
      ]
    );

    const saleItems: (SaleItem & { product_name: string })[] = [];
    for (const item of data.items) {
      const itemId = this.generateId();
      const line_total_cents = item.quantity * item.unit_price_cents;
      const unit_price = item.unit_price_cents / 100;
      const total_price = line_total_cents / 100;

      await db.runAsync(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, unit_price_cents, total_price, line_total_cents, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          saleId,
          item.product_id,
          item.quantity,
          unit_price,
          item.unit_price_cents,
          total_price,
          line_total_cents,
          now,
        ]
      );

      const product = await db.getFirstAsync<{ name: string }>(
        'SELECT name FROM products WHERE id = ?',
        [item.product_id]
      );

      saleItems.push({
        id: itemId,
        sale_id: saleId,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price,
        unit_price_cents: item.unit_price_cents,
        total_price,
        line_total_cents,
        created_at: now,
        product_name: product?.name || 'Unknown',
      });
    }

    const paymentRepo = new PaymentRepository();
    const payments: Payment[] = [];
    for (const payment of data.payments) {
      const p = await paymentRepo.create({
        sale_id: saleId,
        method: payment.method,
        amount_cents: payment.amount_cents,
      });
      payments.push(p);
    }

    if (data.shift_id) {
      const shiftRepo = new ShiftRepository();
      await shiftRepo.addShiftEvent(data.shift_id, 'sale_completed', {
        sale_id: saleId,
        total_cents,
        payment_methods: data.payments.map((p) => p.method).join(', '),
        items_count: data.items.length,
      });

      const totalCashPayments = data.payments
        .filter((p) => p.method === 'CASH')
        .reduce((sum, p) => sum + p.amount_cents, 0);

      const shift = await shiftRepo.getShiftById(data.shift_id);
      if (shift) {
        const newExpectedCash = shift.starting_cash_cents + totalCashPayments;
        await shiftRepo.updateExpectedCash(data.shift_id, newExpectedCash);
      }
    }

    console.log('[SaleRepo] Created sale:', sale.id);

    const worker = await db.getFirstAsync<{ name: string }>(
      'SELECT name FROM users WHERE id = ?',
      [data.worker_id]
    );
    const cart = await db.getFirstAsync<{ name: string }>(
      'SELECT name FROM carts WHERE id = ?',
      [data.cart_id]
    );

    return {
      ...sale,
      items: saleItems,
      payments,
      worker_name: worker?.name || 'Unknown',
      cart_name: cart?.name || 'Unknown',
    };
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

    const paymentRepo = new PaymentRepository();
    const payments = await paymentRepo.findBySaleId(id);

    return { ...sale, items, payments };
  }

  async findAll(options?: {
    cart_id?: string;
    worker_id?: string;
    start_date?: Date;
    end_date?: Date;
    include_voided?: boolean;
  }): Promise<SaleWithItems[]> {
    const db = await this.getDb();
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (!options?.include_voided) {
      conditions.push('s.voided_at IS NULL');
    }

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

    const paymentRepo = new PaymentRepository();
    for (const sale of sales) {
      const items = await db.getAllAsync<SaleItem & { product_name: string }>(
        `SELECT si.*, p.name as product_name
         FROM sale_items si
         JOIN products p ON si.product_id = p.id
         WHERE si.sale_id = ?`,
        [sale.id]
      );

      const payments = await paymentRepo.findBySaleId(sale.id);

      salesWithItems.push({ ...sale, items, payments });
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
    const conditions: string[] = ['1=1', 'voided_at IS NULL'];
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

  async voidSale(saleId: string, userId: string): Promise<void> {
    const db = await this.getDb();
    const now = this.now();

    await db.runAsync(
      'UPDATE sales SET voided_at = ?, voided_by = ? WHERE id = ?',
      [now, userId, saleId]
    );

    console.log('[SaleRepo] Voided sale:', saleId);
  }

  async canEdit(saleId: string, userId: string, userRole: string): Promise<boolean> {
    if (userRole === 'boss') return true;

    const db = await this.getDb();
    const sale = await db.getFirstAsync<Sale>(
      'SELECT * FROM sales WHERE id = ? AND worker_id = ?',
      [saleId, userId]
    );

    if (!sale) return false;

    const now = Date.now();
    const twoMinutes = 2 * 60 * 1000;
    return now - sale.created_at < twoMinutes;
  }
}
