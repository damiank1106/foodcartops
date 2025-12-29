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
    const existingDeveloper = await userRepo.findByRole('developer');
    
    if (existingBoss.length === 0) {
      console.log('[Seed] Creating Boss user...');
      await userRepo.create({
        name: 'Operation Manager',
        role: 'boss',
        pin: '1234',
      });
      console.log('[Seed] Boss user created with PIN 1234');
    } else {
      const boss = existingBoss[0];
      console.log('[Seed] Boss user exists:', boss.id, 'has_pin:', !!boss.pin);
      
      if (!boss.pin) {
        console.log('[Seed] Boss has no PIN, resetting to default 1234');
        await userRepo.resetPin(boss.id, '1234', boss.id);
      }
    }

    if (existingDeveloper.length === 0) {
      console.log('[Seed] Creating Developer user...');
      await userRepo.create({
        name: 'Developer',
        role: 'developer',
        pin: '2345',
      });
      console.log('[Seed] Developer user created with PIN 2345');
    } else {
      const developer = existingDeveloper[0];
      console.log('[Seed] Developer user exists:', developer.id, 'has_pin:', !!developer.pin);
      
      if (!developer.pin) {
        console.log('[Seed] Developer has no PIN, resetting to default 2345');
        await userRepo.resetPin(developer.id, '2345', developer.id);
      }
    }

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
