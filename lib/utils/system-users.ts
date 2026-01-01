import { UserRole } from '../types';

export const SYSTEM_USERS = [
  {
    id: 'system-user-general-manager',
    name: 'Elva',
    role: 'general_manager',
    pin: '1234',
  },
  {
    id: 'system-user-developer',
    name: 'Damian',
    role: 'developer',
    pin: '2345',
  },
  {
    id: 'system-user-operation-manager',
    name: 'Jenifer',
    role: 'operation_manager',
    pin: '1111',
  },
  {
    id: 'system-user-inventory-clerk',
    name: 'Dyna',
    role: 'inventory_clerk',
    pin: '2222',
  },
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  role: UserRole;
  pin: string;
}>;

export const SYSTEM_USER_IDS = {
  GENERAL_MANAGER: SYSTEM_USERS[0].id,
  DEVELOPER: SYSTEM_USERS[1].id,
  OPERATION_MANAGER: SYSTEM_USERS[2].id,
  INVENTORY_CLERK: SYSTEM_USERS[3].id,
} as const;

export const DEFAULT_PINS = {
  GENERAL_MANAGER: SYSTEM_USERS[0].pin,
  DEVELOPER: SYSTEM_USERS[1].pin,
  OPERATION_MANAGER: SYSTEM_USERS[2].pin,
  INVENTORY_CLERK: SYSTEM_USERS[3].pin,
} as const;

export const SYSTEM_USER_ROLES = SYSTEM_USERS.map(user => user.role);
export const SYSTEM_USER_ID_SET = new Set(SYSTEM_USERS.map(user => user.id));

export function isSystemUserId(userId: string): boolean {
  return SYSTEM_USER_ID_SET.has(userId);
}
