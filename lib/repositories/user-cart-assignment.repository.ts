import { UserCartAssignment } from '../types';
import { BaseRepository } from './base';

export class UserCartAssignmentRepository extends BaseRepository {
  async assign(userId: string, cartId: string, createdByUserId: string): Promise<UserCartAssignment> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = Date.now();

    try {
      await db.runAsync(
        'INSERT INTO user_cart_assignments (id, user_id, cart_id, created_at) VALUES (?, ?, ?, ?)',
        [id, userId, cartId, now]
      );

      await this.auditLog(createdByUserId, 'user_cart_assignments', id, 'create', null, {
        user_id: userId,
        cart_id: cartId,
      });

      return { id, user_id: userId, cart_id: cartId, created_at: now };
    } catch (error) {
      console.error('[UserCartAssignmentRepository] Failed to assign:', error);
      throw error;
    }
  }

  async unassign(userId: string, cartId: string, deletedByUserId: string): Promise<void> {
    const db = await this.getDb();

    const existing = await db.getFirstAsync<UserCartAssignment>(
      'SELECT * FROM user_cart_assignments WHERE user_id = ? AND cart_id = ?',
      [userId, cartId]
    );

    if (existing) {
      await db.runAsync(
        'DELETE FROM user_cart_assignments WHERE user_id = ? AND cart_id = ?',
        [userId, cartId]
      );

      await this.auditLog(deletedByUserId, 'user_cart_assignments', existing.id, 'delete', existing, null);
    }
  }

  async getAssignedCartIds(userId: string): Promise<string[]> {
    const db = await this.getDb();
    const results = await db.getAllAsync<{ cart_id: string }>(
      'SELECT cart_id FROM user_cart_assignments WHERE user_id = ?',
      [userId]
    );
    return results.map((r) => r.cart_id);
  }

  async getUsersByCartId(cartId: string): Promise<string[]> {
    const db = await this.getDb();
    const results = await db.getAllAsync<{ user_id: string }>(
      'SELECT user_id FROM user_cart_assignments WHERE cart_id = ?',
      [cartId]
    );
    return results.map((r) => r.user_id);
  }

  async getAssignmentsByUserId(userId: string): Promise<UserCartAssignment[]> {
    const db = await this.getDb();
    const results = await db.getAllAsync<UserCartAssignment>(
      'SELECT * FROM user_cart_assignments WHERE user_id = ?',
      [userId]
    );
    return results;
  }

  async clearUserAssignments(userId: string, deletedByUserId: string): Promise<void> {
    const db = await this.getDb();
    
    const existing = await this.getAssignmentsByUserId(userId);
    
    await db.runAsync('DELETE FROM user_cart_assignments WHERE user_id = ?', [userId]);

    for (const assignment of existing) {
      await this.auditLog(deletedByUserId, 'user_cart_assignments', assignment.id, 'delete', assignment, null);
    }
  }
}
