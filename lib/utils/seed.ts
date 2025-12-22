import { Platform } from 'react-native';
import { UserRepository } from '../repositories';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { resetDatabase } from '../database/init';

const SEED_KEY = 'foodcartops_seeded';

export async function seedDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[Seed] Skipping seed on web');
    return;
  }

  try {
    console.log('[Seed] Checking if seed is needed...');

    const userRepo = new UserRepository();
    
    const existingBoss = await userRepo.findByRole('boss');
    if (existingBoss.length > 0) {
      console.log('[Seed] Database already initialized (Boss user exists)');
      return;
    }

    console.log('[Seed] No Boss user found, initializing database...');

    await userRepo.create({
      name: 'Boss',
      role: 'boss',
      pin: '1234',
    });

    console.log('[Seed] Boss user created with PIN 1234');
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
