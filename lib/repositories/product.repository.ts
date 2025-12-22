import { BaseRepository } from './base';
import { Product } from '../types';
import { AuditRepository } from './audit.repository';

export class ProductRepository extends BaseRepository {
  private auditRepo = new AuditRepository();
  async create(data: {
    name: string;
    category_id?: string;
    description?: string;
    price: number;
    cost_cents?: number;
    sku?: string;
    icon_image_uri?: string;
    category?: string;
    inventory_item_id?: string;
    units_per_sale?: number;
  }, userId?: string): Promise<Product> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const price_cents = Math.round(data.price * 100);

    const units_per_sale = data.units_per_sale !== undefined ? data.units_per_sale : 1;

    if (units_per_sale <= 0) {
      throw new Error('units_per_sale must be greater than 0');
    }

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
      inventory_item_id: data.inventory_item_id,
      units_per_sale,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO products (id, category_id, name, description, price, price_cents, cost_cents, sku, icon_image_uri, category, inventory_item_id, units_per_sale, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [product.id, product.category_id || null, product.name, product.description || null, product.price, product.price_cents, product.cost_cents || null, product.sku || null, product.icon_image_uri || null, product.category || null, product.inventory_item_id || null, product.units_per_sale, product.is_active, product.created_at, product.updated_at]
    );

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
      if (key !== 'id' && key !== 'created_at') {
        updates.push(`${key} = ?`);
        values.push(value === undefined ? null : value);
      }
    });

    updates.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    await db.runAsync(
      `UPDATE products SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    if (userId) {
      const newData = await this.findById(id);
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
    const oldData = await this.findById(id);
    if (!oldData) {
      throw new Error('Product not found');
    }

    await this.update(id, { is_active: 0 }, userId);

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
