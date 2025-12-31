import { BaseRepository } from './base';
import { getDeviceId } from '../utils/device-id';

interface Notification {
  id: string;
  type: 'settlement_incoming' | 'expense_pending' | 'shift_ended';
  entity_id: string;
  entity_type: string;
  title: string;
  message?: string;
  seen_at?: number;
  created_at: number;
  business_id: string;
  device_id?: string;
}

export class NotificationRepository extends BaseRepository {
  async create(
    type: 'settlement_incoming' | 'expense_pending' | 'shift_ended',
    entityId: string,
    entityType: string,
    title: string,
    message?: string
  ): Promise<Notification> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = Date.now();
    const deviceId = await getDeviceId();
    const businessId = 'default_business';

    await db.runAsync(
      `INSERT INTO notifications (
        id, type, entity_id, entity_type, title, message, seen_at, created_at, business_id, device_id
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      [id, type, entityId, entityType, title, message || null, now, businessId, deviceId]
    );

    console.log(`[NotificationRepo] Created notification: ${type} for ${entityId}`);

    return {
      id,
      type,
      entity_id: entityId,
      entity_type: entityType,
      title,
      message,
      created_at: now,
      business_id: businessId,
      device_id: deviceId,
    };
  }

  async getUnseenCount(type?: 'settlement_incoming' | 'expense_pending' | 'shift_ended'): Promise<number> {
    const db = await this.getDb();
    
    let query = 'SELECT COUNT(*) as count FROM notifications WHERE seen_at IS NULL';
    const params: any[] = [];
    
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    const result = await db.getFirstAsync<{ count: number }>(query, params);
    return result?.count || 0;
  }

  async findUnseen(type?: 'settlement_incoming' | 'expense_pending' | 'shift_ended'): Promise<Notification[]> {
    const db = await this.getDb();
    
    let query = 'SELECT * FROM notifications WHERE seen_at IS NULL';
    const params: any[] = [];
    
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY created_at DESC';

    return await db.getAllAsync<Notification>(query, params);
  }

  async markAsSeen(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;

    const db = await this.getDb();
    const now = Date.now();
    const placeholders = notificationIds.map(() => '?').join(',');

    await db.runAsync(
      `UPDATE notifications SET seen_at = ? WHERE id IN (${placeholders})`,
      [now, ...notificationIds]
    );

    console.log(`[NotificationRepo] Marked ${notificationIds.length} notifications as seen`);
  }

  async markAllSeenByType(type: 'settlement_incoming' | 'expense_pending' | 'shift_ended'): Promise<void> {
    const db = await this.getDb();
    const now = Date.now();

    await db.runAsync(
      'UPDATE notifications SET seen_at = ? WHERE type = ? AND seen_at IS NULL',
      [now, type]
    );

    console.log(`[NotificationRepo] Marked all ${type} notifications as seen`);
  }

  async checkIfExists(type: string, entityId: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM notifications WHERE type = ? AND entity_id = ?',
      [type, entityId]
    );
    return (result?.count || 0) > 0;
  }

  async deleteByEntityId(entityId: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync('DELETE FROM notifications WHERE entity_id = ?', [entityId]);
    console.log(`[NotificationRepo] Deleted notifications for entity: ${entityId}`);
  }
}
