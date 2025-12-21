import { Platform } from 'react-native';
import {
  UserRepository,
  CartRepository,
  ProductRepository,
  SaleRepository,
  ShiftRepository,
} from '../repositories';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SEED_KEY = 'foodcartops_seeded';

export async function seedDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[Seed] Skipping seed on web');
    return;
  }

  try {
    const seeded = await AsyncStorage.getItem(SEED_KEY);
    if (seeded) {
      console.log('[Seed] Database already seeded');
      return;
    }

    console.log('[Seed] Starting database seed...');

    const userRepo = new UserRepository();
    const cartRepo = new CartRepository();
    const productRepo = new ProductRepository();
    const saleRepo = new SaleRepository();
    const shiftRepo = new ShiftRepository();

    await userRepo.create({
      name: 'Boss',
      role: 'boss',
      pin: '0000',
      email: 'boss@foodcartops.com',
    });

    const worker1 = await userRepo.create({
      name: 'Alice',
      role: 'worker',
      pin: '1111',
    });

    const worker2 = await userRepo.create({
      name: 'Bob',
      role: 'worker',
      pin: '2222',
    });

    await userRepo.create({
      name: 'Charlie',
      role: 'worker',
      pin: '3333',
    });

    const cart1 = await cartRepo.create({
      name: 'Downtown Cart',
      location: '5th Ave & Main St',
    });

    const cart2 = await cartRepo.create({
      name: 'Beach Cart',
      location: 'Santa Monica Pier',
    });

    const products = [
      { name: 'Hot Dog', price: 5.99, category: 'Main' },
      { name: 'Burger', price: 8.99, category: 'Main' },
      { name: 'Fries', price: 3.99, category: 'Sides' },
      { name: 'Soda', price: 2.49, category: 'Drinks' },
      { name: 'Water', price: 1.99, category: 'Drinks' },
      { name: 'Ice Cream', price: 4.49, category: 'Dessert' },
      { name: 'Chips', price: 2.99, category: 'Sides' },
      { name: 'Coffee', price: 3.49, category: 'Drinks' },
    ];

    const createdProducts = [];
    for (const product of products) {
      const p = await productRepo.create(product);
      createdProducts.push(p);
    }

    await shiftRepo.startShift(worker1.id, cart1.id, 10000);
    await shiftRepo.startShift(worker2.id, cart2.id, 15000);
    const sales = [
      {
        cart_id: cart1.id,
        worker_id: worker1.id,
        total_amount: 14.98,
        payment_method: 'cash' as const,
        items: [
          { product_id: createdProducts[0].id, quantity: 2, unit_price: 5.99 },
          { product_id: createdProducts[3].id, quantity: 1, unit_price: 2.49 },
          { product_id: createdProducts[4].id, quantity: 1, unit_price: 1.99 },
        ],
      },
      {
        cart_id: cart1.id,
        worker_id: worker1.id,
        total_amount: 12.48,
        payment_method: 'card' as const,
        items: [
          { product_id: createdProducts[1].id, quantity: 1, unit_price: 8.99 },
          { product_id: createdProducts[2].id, quantity: 1, unit_price: 3.49 },
        ],
      },
      {
        cart_id: cart2.id,
        worker_id: worker2.id,
        total_amount: 23.45,
        payment_method: 'digital' as const,
        items: [
          { product_id: createdProducts[1].id, quantity: 2, unit_price: 8.99 },
          { product_id: createdProducts[5].id, quantity: 1, unit_price: 4.49 },
          { product_id: createdProducts[4].id, quantity: 1, unit_price: 1.99 },
        ],
      },
    ];

    for (const sale of sales) {
      await saleRepo.create(sale);
    }

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
