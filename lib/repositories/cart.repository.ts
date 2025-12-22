import { BaseRepository } from './base';
import { Cart } from '../types';
import { AuditRepository } from './audit.repository';

export class CartRepository extends BaseRepository {
  private auditRepo = new AuditRepository();

  async create(data: { name: string; location?: string; notes?: string }): Promise<Cart> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const cart: Cart = {
      id,
      name: data.name,
      location: data.location,
      notes: data.notes,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO carts (id, name, location, notes, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cart.id, cart.name, cart.location || null, cart.notes || null, cart.is_active, cart.created_at, cart.updated_at]
    );

    await this.auditRepo.log({
      entity_type: 'cart',
      entity_id: cart.id,
      action: 'create',
      new_data: JSON.stringify(cart),
    });

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

  async findAllIncludingInactive(): Promise<Cart[]> {
    const db = await this.getDb();
    return await db.getAllAsync<Cart>(
      'SELECT * FROM carts ORDER BY is_active DESC, name ASC'
    );
  }

  async update(id: string, data: Partial<Omit<Cart, 'id' | 'created_at'>>): Promise<void> {
    const db = await this.getDb();
    const oldCart = await this.findById(id);
    const updates: string[] = [];
    const values: any[] = [];

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at') {
        updates.push(`${key} = ?`);
        values.push(value === undefined ? null : value);
      }
    });

    updates.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    await db.runAsync(
      `UPDATE carts SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const newCart = await this.findById(id);
    await this.auditRepo.log({
      entity_type: 'cart',
      entity_id: id,
      action: 'update',
      old_data: oldCart ? JSON.stringify(oldCart) : undefined,
      new_data: newCart ? JSON.stringify(newCart) : undefined,
    });

    console.log('[CartRepo] Updated cart:', id);
  }

  async deleteCart(id: string): Promise<void> {
    const db = await this.getDb();
    const cart = await this.findById(id);
    
    await db.runAsync(
      'UPDATE carts SET is_active = 0, updated_at = ? WHERE id = ?',
      [this.now(), id]
    );

    await this.auditRepo.log({
      entity_type: 'cart',
      entity_id: id,
      action: 'delete',
      old_data: cart ? JSON.stringify(cart) : undefined,
    });

    console.log('[CartRepo] Deleted (soft) cart:', id);
  }

  async restoreCart(id: string): Promise<void> {
    const db = await this.getDb();
    const cart = await this.findById(id);
    
    await db.runAsync(
      'UPDATE carts SET is_active = 1, updated_at = ? WHERE id = ?',
      [this.now(), id]
    );

    await this.auditRepo.log({
      entity_type: 'cart',
      entity_id: id,
      action: 'restore',
      old_data: cart ? JSON.stringify(cart) : undefined,
    });

    console.log('[CartRepo] Restored cart:', id);
  }
}
