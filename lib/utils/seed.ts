import { Platform } from 'react-native';
import { UserRepository } from '../repositories/user.repository';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { resetDatabase } from '../database/init';
import { SYSTEM_USERS, SYSTEM_USER_ID_SET } from './system-users';

const SEED_KEY = 'foodcartops_seeded';

export async function ensureSystemUsers(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  const userRepo = new UserRepository();

  console.log('[Seed] Cleaning up invalid system users...');
  await userRepo.cleanupInvalidSystemUsers(SYSTEM_USER_ID_SET);

  for (const sysUser of SYSTEM_USERS) {
    const user = await userRepo.findById(sysUser.id);
    const needsUpsert = !user
      || user.deleted_at
      || user.name !== sysUser.name
      || user.role !== sysUser.role
      || user.pin !== sysUser.pin
      || user.is_active === 0
      || user.is_system !== 1;

    if (needsUpsert) {
      console.log(`[Seed] Upserting ${sysUser.name}...`);
      await userRepo.createSystemUser(
        sysUser.id,
        sysUser.name,
        sysUser.role,
        sysUser.pin,
        true
      );
      console.log(`[Seed] ${sysUser.name} ready (PIN: ${sysUser.pin})`);
    } else {
      console.log(`[Seed] ${sysUser.name} exists:`, { id: user.id, has_pin: !!user.pin });
    }
  }
}

export async function seedDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[Seed] Skipping seed on web');
    return;
  }

  try {
    console.log('[Seed] Ensuring system users...');
    await ensureSystemUsers();
    console.log('[Seed] Database initialized successfully');
  } catch (error) {
    console.error('[Seed] Failed to seed database:', error);
    throw error;
  }
}

export async function resetSeed(): Promise<void> {
  await AsyncStorage.removeItem(SEED_KEY);
  console.log('[Seed] Seed flag reset');
}

export async function forceResetDatabase(): Promise<void> {
  console.log('[Seed] FORCE RESET - wiping all data');
  await resetDatabase();
  await AsyncStorage.clear();
  try {
    await SecureStore.deleteItemAsync('foodcartops_auth');
    await SecureStore.deleteItemAsync('foodcartops_selected_cart');
  } catch (e) {
    console.log('[Seed] SecureStore clear (ignore if empty):', e);
  }
  console.log('[Seed] All data wiped, reseeding...');
  await seedDatabase();
}
