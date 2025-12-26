import type { UserRole } from '@/lib/types';

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'boss':
    case 'boss2':
      return 'General Manager';
    case 'worker':
      return 'Operation Manager';
    case 'inventory_clerk':
      return 'Inventory Clerk';
    case 'developer':
      return 'Developer';
    default:
      return role;
  }
}

export function getRoleDescription(role: UserRole): string {
  switch (role) {
    case 'boss':
    case 'boss2':
      return 'Full access to all features';
    case 'worker':
      return 'Can make sales and submit expenses';
    case 'inventory_clerk':
      return 'Can manage inventory items';
    case 'developer':
      return 'Full access with developer tools';
    default:
      return '';
  }
}
