import { BaseRepository } from './base';
import { Cart } from '../types';
import { AuditRepository } from './audit.repository';
import { SyncOutboxRepository } from './sync-outbox.repository';
import { getDeviceId } from '../utils/device-id';

export class CartRepository extends BaseRepository {
  private auditRepo = new AuditRepository();
  private syncOutbox = new SyncOutboxRepository();

  async create(data: { name: string; location?: string; notes?: string }, userId?: string): Promise<Cart> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();
    const nowISO = new Date(now).toISOString();
    const deviceId = await getDeviceId();

    const cart: Cart = {
      id,
      name: data.name,
      location: data.location,
      notes: data.notes,
      is_active: 1,
      created_at: now,
      updated_at: now,
      business_id: 'default_business',
      device_id: deviceId,
      created_at_iso: nowISO,
      updated_at_iso: nowISO,
    };

    await db.runAsync(
      `INSERT INTO carts (id, name, location, notes, created_by_user_id, is_active, created_at, updated_at, business_id, device_id, created_at_iso, updated_at_iso)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cart.id,
        cart.name,
        cart.location || null,
        cart.notes || null,
        userId || null,
        cart.is_active,
        cart.created_at,
        cart.updated_at,
        cart.business_id ?? 'default_business',
        cart.device_id ?? null,
        cart.created_at_iso ?? nowISO,
        cart.updated_at_iso ?? nowISO,
      ]
    );

    await this.syncOutbox.add('carts', cart.id, 'upsert', cart);

    if (userId) {
      await this.auditRepo.log({
        user_id: userId,
        entity_type: 'cart',
        entity_id: cart.id,
        action: 'create',
        new_data: JSON.stringify(cart),
      });
    }

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
      'SELECT * FROM carts WHERE is_active = 1 AND deleted_at IS NULL ORDER BY name ASC'
    );
  }

  async findAllIncludingInactive(): Promise<Cart[]> {
    const db = await this.getDb();
    return await db.getAllAsync<Cart>(
      'SELECT * FROM carts WHERE deleted_at IS NULL ORDER BY is_active DESC, name ASC'
    );
  }

  async update(id: string, data: Partial<Omit<Cart, 'id' | 'created_at'>>, userId?: string): Promise<void> {
    const db = await this.getDb();
    
    const oldCart = await this.findById(id);
    
    const updates: string[] = [];
    const values: any[] = [];

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && key !== 'created_at_iso') {
        updates.push(`${key} = ?`);
        values.push(value === undefined ? null : value);
      }
    });

    const now = this.now();
    const nowISO = new Date(now).toISOString();
    updates.push('updated_at = ?');
    values.push(now);
    updates.push('updated_at_iso = ?');
    values.push(nowISO);
    values.push(id);

    await db.runAsync(
      `UPDATE carts SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const newCart = await this.findById(id);
    if (newCart) {
      await this.syncOutbox.add('carts', id, 'upsert', newCart);
    }

    if (userId && oldCart) {
      const newCart = await this.findById(id);
      await this.auditRepo.log({
        user_id: userId,
        entity_type: 'cart',
        entity_id: id,
        action: 'update',
        old_data: JSON.stringify(oldCart),
        new_data: JSON.stringify(newCart),
      });
    }

    console.log('[CartRepo] Updated cart:', id);
  }

  async delete(id: string, userId?: string): Promise<void> {
    const db = await this.getDb();
    
    const cart = await this.findById(id);
    if (!cart) {
      throw new Error('Cart not found');
    }

    const now = this.now();
    const nowISO = new Date(now).toISOString();

    await db.runAsync(
      'UPDATE carts SET is_active = 0, deleted_at = ?, updated_at = ?, updated_at_iso = ? WHERE id = ?',
      [nowISO, now, nowISO, id]
    );

    const deletedCart = await this.findById(id);
    if (deletedCart) {
      await this.syncOutbox.add('carts', id, 'upsert', deletedCart);
    }

    if (userId) {
      await this.auditRepo.log({
        user_id: userId,
        entity_type: 'cart',
        entity_id: id,
        action: 'delete',
        old_data: JSON.stringify(cart),
      });
    }

    console.log('[CartRepo] Soft deleted cart:', id);
  }

  async restore(id: string, userId?: string): Promise<void> {
    const db = await this.getDb();
    
    const cart = await this.findById(id);

    const now = this.now();
    const nowISO = new Date(now).toISOString();

    await db.runAsync(
      'UPDATE carts SET is_active = 1, deleted_at = NULL, updated_at = ?, updated_at_iso = ? WHERE id = ?',
      [now, nowISO, id]
    );

    const restoredCart = await this.findById(id);
    if (restoredCart) {
      await this.syncOutbox.add('carts', id, 'upsert', restoredCart);
    }

    if (userId) {
      await this.auditRepo.log({
        user_id: userId,
        entity_type: 'cart',
        entity_id: id,
        action: 'restore',
        new_data: JSON.stringify({ ...cart, is_active: 1 }),
      });
    }

    console.log('[CartRepo] Restored cart:', id);
  }
}
