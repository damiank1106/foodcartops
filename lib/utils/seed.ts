import { Platform } from 'react-native';
import { UserRepository } from '../repositories/user.repository';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { resetDatabase } from '../database/init';
import { SYSTEM_USER_IDS, DEFAULT_PINS } from './system-users';

const SEED_KEY = 'foodcartops_seeded';

export async function ensureSystemUsers(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  const userRepo = new UserRepository();

  const validSystemIds = new Set([
    SYSTEM_USER_IDS.GENERAL_MANAGER,
    SYSTEM_USER_IDS.DEVELOPER,
    SYSTEM_USER_IDS.OPERATION_MANAGER,
    SYSTEM_USER_IDS.INVENTORY_CLERK,
  ]);

  console.log('[Seed] Cleaning up invalid system users...');
  await userRepo.cleanupInvalidSystemUsers(validSystemIds);

  const systemUsers = [
    { id: SYSTEM_USER_IDS.GENERAL_MANAGER, name: 'General Manager', role: 'general_manager' as const, pin: DEFAULT_PINS.GENERAL_MANAGER },
    { id: SYSTEM_USER_IDS.DEVELOPER, name: 'Developer', role: 'developer' as const, pin: DEFAULT_PINS.DEVELOPER },
    { id: SYSTEM_USER_IDS.OPERATION_MANAGER, name: 'Operation Manager', role: 'operation_manager' as const, pin: DEFAULT_PINS.OPERATION_MANAGER },
    { id: SYSTEM_USER_IDS.INVENTORY_CLERK, name: 'Inventory Clerk', role: 'inventory_clerk' as const, pin: DEFAULT_PINS.INVENTORY_CLERK },
  ];

  for (const sysUser of systemUsers) {
    let user = await userRepo.findById(sysUser.id);
    if (!user || user.deleted_at) {
      console.log(`[Seed] Creating/restoring ${sysUser.name}...`);
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
      if (!user.pin || user.is_active === 0 || user.is_system !== 1) {
        console.log(`[Seed] Repairing ${sysUser.name} PIN and activation`);
        await userRepo.repairSystemUserPin(user.id, sysUser.pin, true);
      }
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
