import { BaseRepository } from './base';
import { User, UserRole } from '../types';
import { SyncOutboxRepository } from './sync-outbox.repository';
import { getDeviceId } from '../utils/device-id';
import { isSystemUserId, SYSTEM_USERS, SYSTEM_USER_ROLES } from '../utils/system-users';
import { requireUserManagementRole } from '../utils/rbac';

export class UserRepository extends BaseRepository {
  private syncOutbox = new SyncOutboxRepository();

  async create(data: {
    name: string;
    role: UserRole;
    pin?: string;
    password_hash?: string;
    email?: string;
  }, currentUserRole: UserRole): Promise<User> {
    requireUserManagementRole(currentUserRole);
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    const nowISO = new Date(now).toISOString();
    const deviceId = await getDeviceId();

    const user: User = {
      id,
      name: data.name,
      role: data.role,
      pin: data.pin,
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

    const isSystem = isSystemUserId(user.id) ? 1 : 0;

    await db.runAsync(
      `INSERT INTO users (id, name, role, pin, pin_hash, password_hash, email, created_at, updated_at, is_active, is_system, business_id, device_id, created_at_iso, updated_at_iso)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.name, user.role, user.pin ?? null, user.pin ?? null, user.password_hash ?? null, user.email ?? null, user.created_at, user.updated_at, user.is_active, isSystem, user.business_id ?? 'default_business', user.device_id ?? null, user.created_at_iso ?? nowISO, user.updated_at_iso ?? nowISO]
    );

    const syncPayload = {
      id: user.id,
      name: user.name,
      role: user.role,
      pin: user.pin,
      pin_hash: user.pin ?? null,
      is_active: user.is_active,
      is_system: false,
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
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    return user || null;
  }

  async findByPin(pin: string): Promise<User | null> {
    const db = await this.getDb();
    const user = await db.getFirstAsync<User>(
      'SELECT * FROM users WHERE (pin_hash = ? OR pin = ?) AND is_active = 1 AND deleted_at IS NULL',
      [pin, pin]
    );

    console.log('[UserRepo] findByPin - found user:', user ? user.name : 'none');
    return user || null;
  }

  async findAll(role?: UserRole): Promise<User[]> {
    const db = await this.getDb();
    if (role) {
      return await db.getAllAsync<User>(
        'SELECT * FROM users WHERE role = ? AND deleted_at IS NULL ORDER BY name ASC',
        [role]
      );
    }
    return await db.getAllAsync<User>('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY name ASC');
  }

  async findByRole(role: UserRole): Promise<User[]> {
    const db = await this.getDb();
    return await db.getAllAsync<User>(
      'SELECT * FROM users WHERE role = ? AND is_active = 1 AND deleted_at IS NULL ORDER BY name ASC',
      [role]
    );
  }

  async getActiveWorkers(): Promise<User[]> {
    const db = await this.getDb();
    return await db.getAllAsync<User>(
      'SELECT * FROM users WHERE role = ? AND is_active = 1 AND deleted_at IS NULL ORDER BY name ASC',
      ['operation_manager']
    );
  }

  async getShiftEligibleWorkers(): Promise<User[]> {
    const db = await this.getDb();
    return await db.getAllAsync<User>(
      "SELECT * FROM users WHERE is_active = 1 AND role = 'operation_manager' AND deleted_at IS NULL ORDER BY name ASC"
    );
  }

  async update(id: string, data: Partial<Omit<User, 'id' | 'created_at'>>, currentUserRole: UserRole): Promise<void> {
    requireUserManagementRole(currentUserRole);
    const db = await this.getDb();
    const updates: string[] = [];
    const values: any[] = [];
    const now = this.now();
    const nowISO = new Date(now).toISOString();

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at') {
        updates.push(`${key} = ?`);
        values.push(value);
        if (key === 'pin') {
          updates.push('pin_hash = ?');
          values.push(value);
        }
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
        pin: updatedUser.pin,
        pin_hash: updatedUser.pin ?? null,
        is_active: updatedUser.is_active,
        is_system: isSystemUserId(updatedUser.id),
        business_id: updatedUser.business_id,
        device_id: updatedUser.device_id,
        created_at_iso: updatedUser.created_at_iso,
        updated_at_iso: nowISO,
      };
      await this.syncOutbox.add('users', updatedUser.id, 'upsert', syncPayload);
    }

    console.log('[UserRepo] Updated user:', id);
  }

  async deactivate(id: string, currentUserRole: UserRole): Promise<void> {
    requireUserManagementRole(currentUserRole);
    await this.update(id, { is_active: 0 }, currentUserRole);
    console.log('[UserRepo] Deactivated user:', id);
  }

  async changePin(id: string, oldPin: string, newPin: string): Promise<boolean> {
    const user = await this.findById(id);
    if (!user || !user.pin) {
      return false;
    }

    if (user.pin !== oldPin) {
      return false;
    }

    const db = await this.getDb();
    const now = this.now();
    const nowISO = new Date(now).toISOString();

    await db.runAsync(
      'UPDATE users SET pin = ?, pin_hash = ?, updated_at = ?, updated_at_iso = ? WHERE id = ?',
      [newPin, newPin, now, nowISO, id]
    );

    const updatedUser = await this.findById(id);
    if (updatedUser) {
      const syncPayload = {
        id: updatedUser.id,
        name: updatedUser.name,
        role: updatedUser.role,
        pin: updatedUser.pin,
        pin_hash: updatedUser.pin ?? null,
        is_active: updatedUser.is_active,
        is_system: isSystemUserId(updatedUser.id),
        business_id: updatedUser.business_id,
        device_id: updatedUser.device_id,
        created_at_iso: updatedUser.created_at_iso,
        updated_at_iso: nowISO,
      };
      await this.syncOutbox.add('users', updatedUser.id, 'upsert', syncPayload);
    }

    console.log('[UserRepo] Changed PIN for user:', id);
    return true;
  }

  async resetPin(id: string, newPin: string, resetByUserId: string, currentUserRole: UserRole): Promise<void> {
    requireUserManagementRole(currentUserRole);
    const oldUser = await this.findById(id);
    
    await this.update(id, { pin: newPin }, currentUserRole);

    await this.auditLog(resetByUserId, 'users', id, 'reset_pin', oldUser, {
      ...oldUser,
      pin: newPin,
    });

    console.log('[UserRepo] Reset PIN for user:', id);
  }

  async verifyPinForUser(userId: string, pin: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user || !user.pin) {
      return false;
    }
    return user.pin === pin;
  }

  async updateRole(id: string, newRole: UserRole, updatedByUserId: string, currentUserRole: UserRole): Promise<void> {
    requireUserManagementRole(currentUserRole);
    const oldUser = await this.findById(id);
    
    await this.update(id, { role: newRole }, currentUserRole);

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
  }, createdByUserId: string, currentUserRole: UserRole): Promise<User> {
    requireUserManagementRole(currentUserRole);
    const user = await this.create(data, currentUserRole);

    await this.auditLog(createdByUserId, 'users', user.id, 'create', null, user);

    console.log('[UserRepo] Created user with audit:', user.id);
    return user;
  }

  async updateWithAudit(id: string, data: Partial<Omit<User, 'id' | 'created_at'>>, updatedByUserId: string, currentUserRole: UserRole, isSelfUpdate: boolean = false): Promise<void> {
    if (!isSelfUpdate) {
      requireUserManagementRole(currentUserRole);
    }
    
    const db = await this.getDb();
    const oldUser = await this.findById(id);
    const updates: string[] = [];
    const values: any[] = [];
    const now = this.now();
    const nowISO = new Date(now).toISOString();

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at') {
        updates.push(`${key} = ?`);
        values.push(value);
        if (key === 'pin') {
          updates.push('pin_hash = ?');
          values.push(value);
        }
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
        pin: updatedUser.pin,
        pin_hash: updatedUser.pin ?? null,
        is_active: updatedUser.is_active,
        is_system: isSystemUserId(updatedUser.id),
        business_id: updatedUser.business_id,
        device_id: updatedUser.device_id,
        created_at_iso: updatedUser.created_at_iso,
        updated_at_iso: nowISO,
      };
      await this.syncOutbox.add('users', updatedUser.id, 'upsert', syncPayload);
    }

    const newUser = await this.findById(id);

    await this.auditLog(updatedByUserId, 'users', id, 'update', oldUser, newUser);

    console.log('[UserRepo] Updated user with audit:', id);
  }

  async deactivateWithAudit(id: string, deactivatedByUserId: string, currentUserRole: UserRole): Promise<void> {
    requireUserManagementRole(currentUserRole);
    const oldUser = await this.findById(id);
    
    await this.deactivate(id, currentUserRole);

    const newUser = await this.findById(id);

    await this.auditLog(deactivatedByUserId, 'users', id, 'deactivate', oldUser, newUser);

    console.log('[UserRepo] Deactivated user with audit:', id);
  }

  async activateWithAudit(id: string, activatedByUserId: string, currentUserRole: UserRole): Promise<void> {
    requireUserManagementRole(currentUserRole);
    const oldUser = await this.findById(id);
    
    await this.update(id, { is_active: 1 }, currentUserRole);

    const newUser = await this.findById(id);

    await this.auditLog(activatedByUserId, 'users', id, 'activate', oldUser, newUser);

    console.log('[UserRepo] Activated user with audit:', id);
  }

  async deleteWithAudit(id: string, deletedByUserId: string, currentUserRole: UserRole): Promise<void> {
    requireUserManagementRole(currentUserRole);
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

    const newUser = await db.getFirstAsync<User>('SELECT * FROM users WHERE id = ?', [id]);

    await this.auditLog(deletedByUserId, 'users', id, 'user_deleted', oldUser, newUser);

    console.log('[UserRepo] Deleted user with audit:', id);
  }

  async createSystemUser(id: string, name: string, role: UserRole, pin: string, skipSync: boolean = false): Promise<User> {
    const db = await this.getDb();
    const now = this.now();
    const nowISO = new Date(now).toISOString();
    const deviceId = await getDeviceId();

    const user: User = {
      id,
      name,
      role,
      pin,
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
      `INSERT OR REPLACE INTO users (id, name, role, pin, pin_hash, password_hash, email, created_at, updated_at, is_active, is_system, business_id, device_id, created_at_iso, updated_at_iso, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.name, user.role, user.pin, user.pin, null, null, user.created_at, user.updated_at, user.is_active, user.is_system, user.business_id, user.device_id ?? null, user.created_at_iso, user.updated_at_iso, null] as any[]
    );

    if (!skipSync) {
      const syncPayload = {
        id: user.id,
        name: user.name,
        role: user.role,
        pin: user.pin,
        pin_hash: user.pin ?? null,
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

    await db.runAsync(
      'UPDATE users SET pin = ?, pin_hash = ?, is_active = 1, is_system = 1, updated_at = ?, updated_at_iso = ?, deleted_at = NULL WHERE id = ?',
      [pin, pin, now, nowISO, id]
    );

    if (!skipSync) {
      const updatedUser = await db.getFirstAsync<User>('SELECT * FROM users WHERE id = ?', [id]);
      if (updatedUser) {
        const syncPayload = {
          id: updatedUser.id,
          name: updatedUser.name,
          role: updatedUser.role,
          pin: updatedUser.pin,
          pin_hash: updatedUser.pin ?? null,
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
    return isSystemUserId(userId);
  }

  async cleanupInvalidSystemUsers(validSystemIds: Set<string>): Promise<void> {
    const db = await this.getDb();
    const now = this.now();
    const nowISO = new Date(now).toISOString();

    const systemRolePlaceholders = SYSTEM_USER_ROLES.map(() => '?').join(', ');
    const systemIdPlaceholders = SYSTEM_USERS.map(() => '?').join(', ');
    const systemRoleParams = [...SYSTEM_USER_ROLES, ...SYSTEM_USER_ROLES];
    const systemIdParams = SYSTEM_USERS.map(user => user.id);

    await db.runAsync(
      `DELETE FROM users
       WHERE (
         id NOT IN (${systemIdPlaceholders})
         AND (role IN (${systemRolePlaceholders}) OR is_system = 1)
       )
       OR (
         pin_hash IS NOT NULL
         AND length(pin_hash) > 6
         AND role IN (${systemRolePlaceholders})
       )`,
      [...systemIdParams, ...systemRoleParams]
    );

    const remainingSystemUsers = await db.getAllAsync<User>(
      'SELECT * FROM users WHERE is_system = 1'
    );

    for (const user of remainingSystemUsers) {
      if (!validSystemIds.has(user.id)) {
        console.log(`[UserRepo] Clearing is_system flag from invalid user: ${user.id}`);
        await db.runAsync(
          'UPDATE users SET is_system = 0, updated_at = ?, updated_at_iso = ? WHERE id = ?',
          [now, nowISO, user.id]
        );

        const syncPayload = {
          id: user.id,
          name: user.name,
          role: user.role,
          pin: user.pin,
          pin_hash: user.pin ?? null,
          is_active: user.is_active,
          is_system: false,
          business_id: user.business_id,
          device_id: user.device_id,
          created_at_iso: user.created_at_iso,
          updated_at_iso: nowISO,
        };
        await this.syncOutbox.add('users', user.id, 'upsert', syncPayload);
      }
    }

    console.log('[UserRepo] Cleanup complete');
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
    const systemIds = SYSTEM_USERS.map(user => user.id);
    const placeholders = systemIds.map(() => '?').join(', ');
    const results = await db.getAllAsync<User & { assigned_carts_count: number }>(
     
      `SELECT u.*, 
        COALESCE(COUNT(DISTINCT uca.cart_id), 0) as assigned_carts_count
       FROM users u
       LEFT JOIN user_cart_assignments uca ON u.id = uca.user_id
       WHERE u.deleted_at IS NULL
         AND u.id IN (${placeholders})
       GROUP BY u.id
       ORDER BY u.name ASC`,
      systemIds
    );
    return results;
  }
}
