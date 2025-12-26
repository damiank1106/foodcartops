import { BaseRepository } from './base';
import { Product } from '../types';
import { AuditRepository } from './audit.repository';
import { SyncOutboxRepository } from './sync-outbox.repository';
import { getDeviceId } from '../utils/device-id';

export class ProductRepository extends BaseRepository {
  private auditRepo = new AuditRepository();
  private syncOutbox = new SyncOutboxRepository();
  async create(data: {
    name: string;
    category_id?: string;
    description?: string;
    price: number;
    cost_cents?: number;
    sku?: string;
    icon_image_uri?: string;
    category?: string;
  }, userId?: string): Promise<Product> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();
    const nowISO = new Date(now).toISOString();
    const deviceId = await getDeviceId();

    const price_cents = Math.round(data.price * 100);

    const product: Product = {
      id,
      category_id: data.category_id,
      name: data.name,
      description: data.description,
      price: data.price,
      price_cents,
      cost_cents: data.cost_cents,
      sku: data.sku,
      icon_image_uri: data.icon_image_uri,
      category: data.category,
      is_active: 1,
      created_at: now,
      updated_at: now,
      business_id: 'default_business',
      device_id: deviceId,
      created_at_iso: nowISO,
      updated_at_iso: nowISO,
    };

    await db.runAsync(
      `INSERT INTO products (id, category_id, name, description, price, price_cents, cost_cents, sku, icon_image_uri, category, is_active, created_at, updated_at, business_id, device_id, created_at_iso, updated_at_iso)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.id,
        product.category_id || null,
        product.name,
        product.description || null,
        product.price,
        product.price_cents,
        product.cost_cents || null,
        product.sku || null,
        product.icon_image_uri || null,
        product.category || null,
        product.is_active,
        product.created_at,
        product.updated_at,
        product.business_id ?? 'default_business',
        product.device_id ?? null,
        product.created_at_iso ?? nowISO,
        product.updated_at_iso ?? nowISO,
      ]
    );

    await this.syncOutbox.add('products', product.id, 'upsert', product);

    if (userId) {
      await this.auditRepo.log({
        user_id: userId,
        entity_type: 'product',
        entity_id: product.id,
        action: 'create',
        new_data: JSON.stringify(product),
      });
    }

    console.log('[ProductRepo] Created product:', product.id);
    return product;
  }

  async findById(id: string): Promise<Product | null> {
    const db = await this.getDb();
    const product = await db.getFirstAsync<Product>(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );
    return product || null;
  }

  async findAll(): Promise<Product[]> {
    const db = await this.getDb();
    return await db.getAllAsync<Product>(
      'SELECT * FROM products WHERE is_active = 1 ORDER BY category ASC, name ASC'
    );
  }

  async findByCategory(category: string): Promise<Product[]> {
    const db = await this.getDb();
    return await db.getAllAsync<Product>(
      'SELECT * FROM products WHERE category = ? AND is_active = 1 ORDER BY name ASC',
      [category]
    );
  }

  async findByCategoryId(categoryId: string): Promise<Product[]> {
    const db = await this.getDb();
    return await db.getAllAsync<Product>(
      'SELECT * FROM products WHERE category_id = ? AND is_active = 1 ORDER BY name ASC',
      [categoryId]
    );
  }

  async listAll(): Promise<Product[]> {
    const db = await this.getDb();
    return await db.getAllAsync<Product>(
      'SELECT * FROM products ORDER BY name ASC'
    );
  }

  async update(id: string, data: Partial<Omit<Product, 'id' | 'created_at'>>, userId?: string): Promise<void> {
    const db = await this.getDb();
    
    const oldData = await this.findById(id);
    if (!oldData) {
      throw new Error('Product not found');
    }

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
      `UPDATE products SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const newData = await this.findById(id);
    if (newData) {
      await this.syncOutbox.add('products', id, 'upsert', newData);
    }

    if (userId) {
      await this.auditRepo.log({
        user_id: userId,
        entity_type: 'product',
        entity_id: id,
        action: 'update',
        old_data: JSON.stringify(oldData),
        new_data: JSON.stringify(newData),
      });
    }

    console.log('[ProductRepo] Updated product:', id);
  }

  async softDelete(id: string, userId?: string): Promise<void> {
    const db = await this.getDb();
    const oldData = await this.findById(id);
    if (!oldData) {
      throw new Error('Product not found');
    }

    const now = this.now();
    const nowISO = new Date(now).toISOString();

    await db.runAsync(
      'UPDATE products SET is_active = 0, deleted_at = ?, updated_at = ?, updated_at_iso = ? WHERE id = ?',
      [nowISO, now, nowISO, id]
    );

    const deletedData = await this.findById(id);
    if (deletedData) {
      await this.syncOutbox.add('products', id, 'upsert', deletedData);
    }

    if (userId) {
      await this.auditRepo.log({
        user_id: userId,
        entity_type: 'product',
        entity_id: id,
        action: 'delete',
        old_data: JSON.stringify(oldData),
      });
    }

    console.log('[ProductRepo] Soft deleted product:', id);
  }

  async restore(id: string, userId?: string): Promise<void> {
    await this.update(id, { is_active: 1 }, userId);
    console.log('[ProductRepo] Restored product:', id);
  }
}
