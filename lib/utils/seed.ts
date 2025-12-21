import { Platform } from 'react-native';
import { UserRepository } from '../repositories';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { resetDatabase } from '../database/init';

const SEED_KEY = 'foodcartops_seeded';
const FORCE_RESET = true;

export async function seedDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[Seed] Skipping seed on web');
    return;
  }

  try {
    if (FORCE_RESET) {
      console.log('[Seed] FORCE_RESET enabled - wiping all data');
      await resetDatabase();
      await AsyncStorage.clear();
      try {
        await SecureStore.deleteItemAsync('foodcartops_auth');
        await SecureStore.deleteItemAsync('foodcartops_selected_cart');
      } catch (e) {
        console.log('[Seed] SecureStore clear (ignore if empty):', e);
      }
      console.log('[Seed] All data wiped, reseeding...');
    } else {
      const seeded = await AsyncStorage.getItem(SEED_KEY);
      if (seeded) {
        console.log('[Seed] Database already seeded');
        return;
      }
    }

    console.log('[Seed] Starting database seed...');

    const userRepo = new UserRepository();

    await userRepo.create({
      name: 'Boss',
      role: 'boss',
      pin: '1234',
    });

    console.log('[Seed] Boss user created with PIN 1234');

    await AsyncStorage.setItem(SEED_KEY, 'true');
    console.log('[Seed] Database seeded successfully');
  } catch (error) {
    console.error('[Seed] Failed to seed database:', error);
    throw error;
  }
}

export async function resetSeed(): Promise<void> {
  await AsyncStorage.removeItem(SEED_KEY);
  console.log('[Seed] Seed flag reset');
}
