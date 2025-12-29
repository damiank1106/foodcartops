import { Platform } from 'react-native';
import { UserRepository } from '../repositories';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { resetDatabase } from '../database/init';

const SEED_KEY = 'foodcartops_seeded';

export const SYSTEM_USER_IDS = {
  OPERATION_MANAGER: 'system-user-operation-manager',
  DEVELOPER: 'system-user-developer',
} as const;

export const DEFAULT_PINS = {
  OPERATION_MANAGER: '1234',
  DEVELOPER: '2345',
} as const;

export async function ensureSystemUsers(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  const userRepo = new UserRepository();

  let boss = await userRepo.findById(SYSTEM_USER_IDS.OPERATION_MANAGER);
  if (!boss || boss.deleted_at) {
    console.log('[Seed] Creating/restoring Operation Manager...');
    await userRepo.createSystemUser(
      SYSTEM_USER_IDS.OPERATION_MANAGER,
      'Operation Manager',
      'boss',
      DEFAULT_PINS.OPERATION_MANAGER
    );
    console.log('[Seed] Operation Manager ready (PIN: 1234)');
  } else {
    console.log('[Seed] Operation Manager exists:', { id: boss.id, has_pin: !!boss.pin });
    if (!boss.pin || boss.is_active === 0) {
      console.log('[Seed] Repairing Operation Manager PIN and activation');
      await userRepo.repairSystemUserPin(boss.id, DEFAULT_PINS.OPERATION_MANAGER);
    }
  }

  let developer = await userRepo.findById(SYSTEM_USER_IDS.DEVELOPER);
  if (!developer || developer.deleted_at) {
    console.log('[Seed] Creating/restoring Developer...');
    await userRepo.createSystemUser(
      SYSTEM_USER_IDS.DEVELOPER,
      'Developer',
      'developer',
      DEFAULT_PINS.DEVELOPER
    );
    console.log('[Seed] Developer ready (PIN: 2345)');
  } else {
    console.log('[Seed] Developer exists:', { id: developer.id, has_pin: !!developer.pin });
    if (!developer.pin || developer.is_active === 0) {
      console.log('[Seed] Repairing Developer PIN and activation');
      await userRepo.repairSystemUserPin(developer.id, DEFAULT_PINS.DEVELOPER);
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
