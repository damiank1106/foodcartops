import { Platform } from 'react-native';
import { UserRepository, ProductRepository } from '../repositories';
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
    const productRepo = new ProductRepository();

    await userRepo.create({
      name: 'Boss',
      role: 'boss',
      pin: '1234',
    });

    console.log('[Seed] Boss user created with PIN 1234');

    const products = [
      { name: 'Burger', price: 150, category: 'Main Dishes' },
      { name: 'Hotdog', price: 80, category: 'Main Dishes' },
      { name: 'Pizza Slice', price: 120, category: 'Main Dishes' },
      { name: 'Fries', price: 60, category: 'Sides' },
      { name: 'Nachos', price: 90, category: 'Sides' },
      { name: 'Coke', price: 40, category: 'Drinks' },
      { name: 'Water', price: 20, category: 'Drinks' },
      { name: 'Iced Tea', price: 35, category: 'Drinks' },
      { name: 'Ice Cream', price: 50, category: 'Desserts' },
    ];

    for (const product of products) {
      await productRepo.create(product);
    }

    console.log('[Seed] Sample products created');

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
