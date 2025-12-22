import { BaseRepository } from './base';
import { ProductCategory } from '../types';
import { AuditRepository } from './audit.repository';

export class ProductCategoryRepository extends BaseRepository {
  private auditRepo = new AuditRepository();

  async create(data: { name: string; sort_order?: number }, userId?: string): Promise<ProductCategory> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const category: ProductCategory = {
      id,
      name: data.name,
      sort_order: data.sort_order ?? 0,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO product_categories (id, name, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [category.id, category.name, category.sort_order, category.is_active, category.created_at, category.updated_at]
    );

    if (userId) {
      await this.auditRepo.log({
        user_id: userId,
        entity_type: 'product_category',
        entity_id: category.id,
        action: 'create',
        new_data: JSON.stringify(category),
      });
    }

    console.log('[ProductCategoryRepo] Created category:', category.id);
    return category;
  }

  async findById(id: string): Promise<ProductCategory | null> {
    const db = await this.getDb();
    const category = await db.getFirstAsync<ProductCategory>(
      'SELECT * FROM product_categories WHERE id = ?',
      [id]
    );
    return category || null;
  }

  async listActive(): Promise<ProductCategory[]> {
    const db = await this.getDb();
    return await db.getAllAsync<ProductCategory>(
      'SELECT * FROM product_categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
    );
  }

  async listAll(): Promise<ProductCategory[]> {
    const db = await this.getDb();
    return await db.getAllAsync<ProductCategory>(
      'SELECT * FROM product_categories ORDER BY sort_order ASC, name ASC'
    );
  }

  async update(id: string, data: Partial<Omit<ProductCategory, 'id' | 'created_at'>>, userId?: string): Promise<void> {
    const db = await this.getDb();
    
    const oldData = await this.findById(id);
    if (!oldData) {
      throw new Error('Product category not found');
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(data.sort_order);
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(data.is_active);
    }

    updates.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    await db.runAsync(
      `UPDATE product_categories SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    if (userId) {
      const newData = await this.findById(id);
      await this.auditRepo.log({
        user_id: userId,
        entity_type: 'product_category',
        entity_id: id,
        action: 'update',
        old_data: JSON.stringify(oldData),
        new_data: JSON.stringify(newData),
      });
    }

    console.log('[ProductCategoryRepo] Updated category:', id);
  }

  async softDelete(id: string, userId?: string): Promise<void> {
    const oldData = await this.findById(id);
    if (!oldData) {
      throw new Error('Product category not found');
    }

    await this.update(id, { is_active: 0 }, userId);

    if (userId) {
      await this.auditRepo.log({
        user_id: userId,
        entity_type: 'product_category',
        entity_id: id,
        action: 'delete',
        old_data: JSON.stringify(oldData),
      });
    }

    console.log('[ProductCategoryRepo] Soft deleted category:', id);
  }

  async restore(id: string, userId?: string): Promise<void> {
    await this.update(id, { is_active: 1 }, userId);
    console.log('[ProductCategoryRepo] Restored category:', id);
  }
}
