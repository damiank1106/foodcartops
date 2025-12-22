import { BaseRepository } from './base';
import { Cart } from '../types';

export class CartRepository extends BaseRepository {
  async create(data: { name: string; location?: string }): Promise<Cart> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const cart: Cart = {
      id,
      name: data.name,
      location: data.location,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO carts (id, name, location, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cart.id, cart.name, cart.location || null, cart.is_active, cart.created_at, cart.updated_at]
    );

    console.log('[CartRepo] Created cart:', cart.id);
    return cart;
  }

  async findById(id: string): Promise<Cart | null> {
    const db = await this.getDb();
    const cart = await db.getFirstAsync<Cart>(
      'SELECT * FROM carts WHERE id = ?',
      [id]
    );
    return cart || null;
  }

  async findAll(): Promise<Cart[]> {
    const db = await this.getDb();
    return await db.getAllAsync<Cart>(
      'SELECT * FROM carts WHERE is_active = 1 ORDER BY name ASC'
    );
  }

  async update(id: string, data: Partial<Omit<Cart, 'id' | 'created_at'>>): Promise<void> {
    const db = await this.getDb();
    const updates: string[] = [];
    const values: any[] = [];

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at') {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    });

    updates.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    await db.runAsync(
      `UPDATE carts SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    console.log('[CartRepo] Updated cart:', id);
  }
}
