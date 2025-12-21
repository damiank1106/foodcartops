import { BaseRepository } from './base';
import { User, UserRole } from '../types';
import { hashPin, verifyPin } from '../utils/crypto';

export class UserRepository extends BaseRepository {
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

    const user: User = {
      id,
      name: data.name,
      role: data.role,
      pin: pinHash,
      password_hash: data.password_hash,
      email: data.email,
      created_at: now,
      updated_at: now,
      is_active: 1,
    };

    await db.runAsync(
      `INSERT INTO users (id, name, role, pin, password_hash, email, created_at, updated_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.name, user.role, user.pin ?? null, user.password_hash ?? null, user.email ?? null, user.created_at, user.updated_at, user.is_active]
    );

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

    for (const user of users) {
      if (user.pin && await verifyPin(pin, user.pin)) {
        return user;
      }
    }

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

  async getActiveWorkers(): Promise<User[]> {
    const db = await this.getDb();
    return await db.getAllAsync<User>(
      'SELECT * FROM users WHERE role = ? AND is_active = 1 ORDER BY name ASC',
      ['worker']
    );
  }

  async update(id: string, data: Partial<Omit<User, 'id' | 'created_at'>>): Promise<void> {
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
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

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
    await this.update(id, { pin: newPinHash });
    console.log('[UserRepo] Changed PIN for user:', id);
    return true;
  }
}
