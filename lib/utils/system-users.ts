export const SYSTEM_USER_IDS = {
  GENERAL_MANAGER: 'system-user-general-manager',
  DEVELOPER: 'system-user-developer',
  OPERATION_MANAGER: 'system-user-operation-manager',
  INVENTORY_CLERK: 'system-user-inventory-clerk',
} as const;

export const DEFAULT_PINS = {
  GENERAL_MANAGER: '1234',
  DEVELOPER: '2345',
  OPERATION_MANAGER: '1111',
  INVENTORY_CLERK: '2222',
} as const;

export function isSystemUserId(userId: string): boolean {
  return userId.startsWith('system-user-');
}
