import { UserRole } from '../types';

export class UnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized action') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'general_manager' || role === 'developer';
}

export function requireUserManagementRole(role: UserRole): void {
  if (!canManageUsers(role)) {
    throw new UnauthorizedError('Only General Manager and Developer can manage users');
  }
}
