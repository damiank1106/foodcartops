import { BaseRepository } from './base';
import { Product } from '../types';

export class ProductRepository extends BaseRepository {
  async create(data: { name: string; price: number; category?: string }): Promise<Product> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const product: Product = {
      id,
      name: data.name,
      price: data.price,
      category: data.category,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO products (id, name, price, category, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [product.id, product.name, product.price, product.category || null, product.is_active, product.created_at, product.updated_at]
    );

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

  async update(id: string, data: Partial<Omit<Product, 'id' | 'created_at'>>): Promise<void> {
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
      `UPDATE products SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    console.log('[ProductRepo] Updated product:', id);
  }
}
