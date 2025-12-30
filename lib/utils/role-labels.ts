import type { UserRole } from '@/lib/types';

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'general_manager':
      return 'General Manager';
    case 'operation_manager':
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
    case 'general_manager':
      return 'Full access to all features';
    case 'operation_manager':
      return 'Can make sales and submit expenses';
    case 'inventory_clerk':
      return 'Can manage inventory items';
    case 'developer':
      return 'Full access with developer tools';
    default:
      return '';
  }
}
