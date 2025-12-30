import { BaseRepository } from './base';
import { User, UserRole } from '../types';
import { hashPin, verifyPin } from '../utils/crypto';
import { SyncOutboxRepository } from './sync-outbox.repository';
import { getDeviceId } from '../utils/device-id';
import { SYSTEM_USER_IDS } from '../utils/seed';

export class UserRepository extends BaseRepository {
  private syncOutbox = new SyncOutboxRepository();

  async create(data: {
    name: string;
    role: UserRole;
    pin?: string;
    password_hash?: string;
    email?: string;
  }): Promise<User> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const pinHash = data.pin ? await hashPin(data.pin) : undefined;
    const nowISO = new Date(now).toISOString();
    const deviceId = await getDeviceId();

    const user: User = {
      id,
      name: data.name,
      role: data.role,
      pin: pinHash,
      pin_hash_alg: pinHash ? 'sha256-v1' : undefined,
      password_hash: data.password_hash,
      email: data.email,
      created_at: now,
      updated_at: now,
      is_active: 1,
      business_id: 'default_business',
      device_id: deviceId,
      created_at_iso: nowISO,
      updated_at_iso: nowISO,
    };

    await db.runAsync(
      `INSERT INTO users (id, name, role, pin, pin_hash_alg, password_hash, email, created_at, updated_at, is_active, business_id, device_id, created_at_iso, updated_at_iso)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.name, user.role, user.pin ?? null, user.pin_hash_alg ?? null, user.password_hash ?? null, user.email ?? null, user.created_at, user.updated_at, user.is_active, user.business_id ?? 'default_business', user.device_id ?? null, user.created_at_iso ?? nowISO, user.updated_at_iso ?? nowISO]
    );

    const syncPayload = {
      id: user.id,
      name: user.name,
      role: user.role,
      pin_hash: user.pin,
      pin_hash_alg: user.pin_hash_alg,
      is_active: user.is_active,
      business_id: user.business_id,
      device_id: user.device_id,
      created_at_iso: user.created_at_iso,
      updated_at_iso: user.updated_at_iso,
    };

    await this.syncOutbox.add('users', user.id, 'upsert', syncPayload);

    console.log('[UserRepo] Created user:', user.id);
    return user;
  }

  async findById(id: string): Promise<User | null> {
    const db = await this.getDb();
    const user = await db.getFirstAsync<User>(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );
    return user || null;
  }

  async findByPin(pin: string): Promise<User | null> {
    const db = await this.getDb();
    const users = await db.getAllAsync<User>(
      'SELECT * FROM users WHERE pin IS NOT NULL AND is_active = 1'
    );

    console.log('[UserRepo] findByPin - checking', users.length, 'users for PIN:', pin);

    for (const user of users) {
      console.log('[UserRepo] Checking user:', user.name, 'has pin:', !!user.pin);
      if (user.pin) {
        const isValid = await verifyPin(pin, user.pin);
        console.log('[UserRepo] PIN verification for', user.name, ':', isValid);
        if (isValid) {
          return user;
        }
      }
    }

    console.log('[UserRepo] No user found with PIN:', pin);
    return null;
  }

  async findAll(role?: UserRole): Promise<User[]> {
    const db = await this.getDb();
    if (role) {
      return await db.getAllAsync<User>(
        'SELECT * FROM users WHERE role = ? ORDER BY name ASC',
        [role]
      );
    }
    return await db.getAllAsync<User>('SELECT * FROM users ORDER BY name ASC');
  }

  async findByRole(role: UserRole): Promise<User[]> {
    const db = await this.getDb();
    return await db.getAllAsync<User>(
      'SELECT * FROM users WHERE role = ? AND is_active = 1 ORDER BY name ASC',
      [role]
    );
  }

  async getActiveWorkers(): Promise<User[]> {
    const db = await this.getDb();
    return await db.getAllAsync<User>(
      'SELECT * FROM users WHERE role = ? AND is_active = 1 ORDER BY name ASC',
      ['worker']
    );
  }

  async getShiftEligibleWorkers(): Promise<User[]> {
    const db = await this.getDb();
    return await db.getAllAsync<User>(
      "SELECT * FROM users WHERE is_active = 1 AND role = 'worker' ORDER BY name ASC"
    );
  }

  async update(id: string, data: Partial<Omit<User, 'id' | 'created_at'>>): Promise<void> {
    const db = await this.getDb();
    const updates: string[] = [];
    const values: any[] = [];
    const now = this.now();
    const nowISO = new Date(now).toISOString();

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at') {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    });

    updates.push('updated_at = ?');
    updates.push('updated_at_iso = ?');
    values.push(now);
    values.push(nowISO);
    values.push(id);

    await db.runAsync(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const updatedUser = await this.findById(id);
    if (updatedUser) {
      const syncPayload = {
        id: updatedUser.id,
        name: updatedUser.name,
        role: updatedUser.role,
        pin_hash: updatedUser.pin,
        pin_hash_alg: updatedUser.pin_hash_alg,
        is_active: updatedUser.is_active,
        business_id: updatedUser.business_id,
        device_id: updatedUser.device_id,
        created_at_iso: updatedUser.created_at_iso,
        updated_at_iso: nowISO,
      };
      await this.syncOutbox.add('users', updatedUser.id, 'upsert', syncPayload);
    }

    console.log('[UserRepo] Updated user:', id);
  }

  async deactivate(id: string): Promise<void> {
    await this.update(id, { is_active: 0 });
    console.log('[UserRepo] Deactivated user:', id);
  }

  async changePin(id: string, oldPin: string, newPin: string): Promise<boolean> {
    const user = await this.findById(id);
    if (!user || !user.pin) {
      return false;
    }

    const isValid = await verifyPin(oldPin, user.pin);
    if (!isValid) {
      return false;
    }

    const newPinHash = await hashPin(newPin);
    await this.update(id, { pin: newPinHash, pin_hash_alg: 'sha256-v1' });
    console.log('[UserRepo] Changed PIN for user:', id);
    return true;
  }

  async resetPin(id: string, newPin: string, resetByUserId: string): Promise<void> {
    const oldUser = await this.findById(id);
    
    const newPinHash = await hashPin(newPin);
    await this.update(id, { pin: newPinHash, pin_hash_alg: 'sha256-v1' });

    await this.auditLog(resetByUserId, 'users', id, 'reset_pin', oldUser, {
      ...oldUser,
      pin: newPinHash,
    });

    console.log('[UserRepo] Reset PIN for user:', id);
  }

  async verifyPinForUser(userId: string, pin: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user || !user.pin) {
      return false;
    }
    return await verifyPin(pin, user.pin);
  }

  async updateRole(id: string, newRole: UserRole, updatedByUserId: string): Promise<void> {
    const oldUser = await this.findById(id);
    
    await this.update(id, { role: newRole });

    await this.auditLog(updatedByUserId, 'users', id, 'assign_role', oldUser, {
      ...oldUser,
      role: newRole,
    });

    console.log('[UserRepo] Updated role for user:', id, 'to', newRole);
  }

  async createWithAudit(data: {
    name: string;
    role: UserRole;
    pin?: string;
    password_hash?: string;
    email?: string;
  }, createdByUserId: string): Promise<User> {
    const user = await this.create(data);

    await this.auditLog(createdByUserId, 'users', user.id, 'create', null, user);

    console.log('[UserRepo] Created user with audit:', user.id);
    return user;
  }

  async updateWithAudit(id: string, data: Partial<Omit<User, 'id' | 'created_at'>>, updatedByUserId: string): Promise<void> {
    const oldUser = await this.findById(id);
    
    await this.update(id, data);

    const newUser = await this.findById(id);

    await this.auditLog(updatedByUserId, 'users', id, 'update', oldUser, newUser);

    console.log('[UserRepo] Updated user with audit:', id);
  }

  async deactivateWithAudit(id: string, deactivatedByUserId: string): Promise<void> {
    const oldUser = await this.findById(id);
    
    await this.deactivate(id);

    const newUser = await this.findById(id);

    await this.auditLog(deactivatedByUserId, 'users', id, 'deactivate', oldUser, newUser);

    console.log('[UserRepo] Deactivated user with audit:', id);
  }

  async activateWithAudit(id: string, activatedByUserId: string): Promise<void> {
    const oldUser = await this.findById(id);
    
    await this.update(id, { is_active: 1 });

    const newUser = await this.findById(id);

    await this.auditLog(activatedByUserId, 'users', id, 'activate', oldUser, newUser);

    console.log('[UserRepo] Activated user with audit:', id);
  }

  async deleteWithAudit(id: string, deletedByUserId: string): Promise<void> {
    const db = await this.getDb();
    const oldUser = await this.findById(id);
    if (!oldUser) throw new Error('User not found');
    
    const now = this.now();
    const nowISO = new Date(now).toISOString();
    
    await db.runAsync(
      'UPDATE users SET deleted_at = ?, updated_at = ?, updated_at_iso = ? WHERE id = ?',
      [nowISO, now, nowISO, id]
    );

    await this.syncOutbox.add('users', id, 'delete', { id, deleted_at: nowISO, updated_at_iso: nowISO });

    const newUser = await this.findById(id);

    await this.auditLog(deletedByUserId, 'users', id, 'user_deleted', oldUser, newUser);

    console.log('[UserRepo] Deleted user with audit:', id);
  }

  async createSystemUser(id: string, name: string, role: UserRole, pin: string, skipSync: boolean = false): Promise<User> {
    const db = await this.getDb();
    const now = this.now();
    const nowISO = new Date(now).toISOString();
    const deviceId = await getDeviceId();

    const pinHash = await hashPin(pin);

    const user: User = {
      id,
      name,
      role,
      pin: pinHash,
      pin_hash_alg: 'sha256-v1',
      created_at: now,
      updated_at: now,
      is_active: 1,
      is_system: 1,
      business_id: 'default_business',
      device_id: deviceId,
      created_at_iso: nowISO,
      updated_at_iso: nowISO,
    };

    await db.runAsync(
      `INSERT OR REPLACE INTO users (id, name, role, pin, pin_hash_alg, password_hash, email, created_at, updated_at, is_active, is_system, business_id, device_id, created_at_iso, updated_at_iso, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.name, user.role, user.pin, user.pin_hash_alg, null, null, user.created_at, user.updated_at, user.is_active, user.is_system, user.business_id, user.device_id ?? null, user.created_at_iso, user.updated_at_iso, null] as any[]
    );

    if (!skipSync) {
      const syncPayload = {
        id: user.id,
        name: user.name,
        role: user.role,
        pin_hash: user.pin,
        pin_hash_alg: user.pin_hash_alg,
        is_active: user.is_active,
        is_system: true,
        business_id: user.business_id,
        device_id: user.device_id,
        created_at_iso: user.created_at_iso,
        updated_at_iso: user.updated_at_iso,
      };

      await this.syncOutbox.add('users', user.id, 'upsert', syncPayload);
    }

    console.log('[UserRepo] Created system user:', user.id, skipSync ? '(no sync)' : '');
    return user;
  }

  async repairSystemUserPin(id: string, pin: string, skipSync: boolean = false): Promise<void> {
    const db = await this.getDb();
    const now = this.now();
    const nowISO = new Date(now).toISOString();

    const pinHash = await hashPin(pin);

    await db.runAsync(
      'UPDATE users SET pin = ?, pin_hash_alg = ?, is_active = 1, is_system = 1, updated_at = ?, updated_at_iso = ?, deleted_at = NULL WHERE id = ?',
      [pinHash, 'sha256-v1', now, nowISO, id]
    );

    if (!skipSync) {
      const updatedUser = await this.findById(id);
      if (updatedUser) {
        const syncPayload = {
          id: updatedUser.id,
          name: updatedUser.name,
          role: updatedUser.role,
          pin_hash: updatedUser.pin,
          pin_hash_alg: updatedUser.pin_hash_alg,
          is_active: updatedUser.is_active,
          is_system: true,
          business_id: updatedUser.business_id,
          device_id: updatedUser.device_id,
          created_at_iso: updatedUser.created_at_iso,
          updated_at_iso: nowISO,
        };
        await this.syncOutbox.add('users', updatedUser.id, 'upsert', syncPayload);
      }
    }

    console.log('[UserRepo] Repaired system user PIN:', id, skipSync ? '(no sync)' : '');
  }

  isSystemUser(userId: string): boolean {
    return userId === SYSTEM_USER_IDS.OPERATION_MANAGER || userId === SYSTEM_USER_IDS.DEVELOPER;
  }

  async updateProfileImage(userId: string, imageUri: string | null, actorUserId: string): Promise<void> {
    const db = await this.getDb();
    const oldUser = await this.findById(userId);
    
    await db.runAsync(
      'UPDATE users SET profile_image_uri = ?, updated_at = ? WHERE id = ?',
      [imageUri ?? null, this.now(), userId]
    );

    await this.auditLog(
      actorUserId,
      'user_profile',
      userId,
      imageUri ? 'profile_picture_set' : 'profile_picture_delete',
      oldUser,
      { profile_image_uri: imageUri }
    );

    console.log('[UserRepo] Updated profile image for user:', userId);
  }

  async getAllWithCartCounts(): Promise<(User & { assigned_carts_count: number })[]> {
    const db = await this.getDb();
    const results = await db.getAllAsync<User & { assigned_carts_count: number }>(
     
      `SELECT u.*, 
        COALESCE(COUNT(DISTINCT uca.cart_id), 0) as assigned_carts_count
       FROM users u
       LEFT JOIN user_cart_assignments uca ON u.id = uca.user_id
       GROUP BY u.id
       ORDER BY u.name ASC`
    );
    return results;
  }
}
