import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import createContextHook from '@nkzw/create-context-hook';
import { User } from '../types';
import { UserRepository, ShiftRepository } from '../repositories';
import { UserCartAssignmentRepository } from '../repositories/user-cart-assignment.repository';

const AUTH_KEY = 'foodcartops_auth';
const CART_KEY = 'foodcartops_selected_cart';

interface AuthState {
  user: User | null;
  selectedCartId: string | null;
  activeShiftId: string | null;
  assignedCartIds: string[];
  isLoading: boolean;
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [state, setState] = useState<AuthState>({
    user: null,
    selectedCartId: null,
    activeShiftId: null,
    assignedCartIds: [],
    isLoading: true,
  });

  const userRepo = new UserRepository();
  const shiftRepo = new ShiftRepository();
  const assignmentRepo = new UserCartAssignmentRepository();

  useEffect(() => {
    loadAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAuth = async () => {
    if (Platform.OS === 'web') {
      setState({ user: null, selectedCartId: null, activeShiftId: null, assignedCartIds: [], isLoading: false });
      return;
    }

    try {
      const authData = await SecureStore.getItemAsync(AUTH_KEY);
      const cartId = await SecureStore.getItemAsync(CART_KEY);

      if (authData) {
        const { userId } = JSON.parse(authData);
        const user = await userRepo.findById(userId);

        if (user) {
          let activeShiftId: string | null = null;
          let selectedCart = cartId;
          let assignedCartIds: string[] = [];

          if (user.role === 'worker' || user.role === 'manager') {
            const activeShift = await shiftRepo.getActiveShift(user.id);
            activeShiftId = activeShift?.id || null;
            if (activeShift && !selectedCart) {
              selectedCart = activeShift.cart_id;
              await SecureStore.setItemAsync(CART_KEY, activeShift.cart_id);
            }
          }

          if (user.role === 'manager') {
            assignedCartIds = await assignmentRepo.getAssignedCartIds(user.id);
          }

          setState({
            user,
            selectedCartId: selectedCart,
            activeShiftId,
            assignedCartIds,
            isLoading: false,
          });
          return;
        }
      }

      setState({ user: null, selectedCartId: null, activeShiftId: null, assignedCartIds: [], isLoading: false });
    } catch (error) {
      console.error('[Auth] Failed to load auth:', error);
      setState({ user: null, selectedCartId: null, activeShiftId: null, assignedCartIds: [], isLoading: false });
    }
  };

  const loginWithPin = async (pin: string): Promise<boolean> => {
    if (Platform.OS === 'web') {
      return false;
    }

    try {
      const user = await userRepo.findByPin(pin);

      if (!user) {
        return false;
      }

      await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({ userId: user.id }));

      let activeShiftId: string | null = null;
      let assignedCartIds: string[] = [];

      if (user.role === 'worker' || user.role === 'manager') {
        const activeShift = await shiftRepo.getActiveShift(user.id);
        activeShiftId = activeShift?.id || null;
      }

      if (user.role === 'manager') {
        assignedCartIds = await assignmentRepo.getAssignedCartIds(user.id);
      }

      setState((prev) => ({
        ...prev,
        user,
        activeShiftId,
        assignedCartIds,
        isLoading: false,
      }));

      console.log('[Auth] Login successful:', user.name);
      return true;
    } catch (error) {
      console.error('[Auth] Login failed:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      if ((state.user?.role === 'worker' || state.user?.role === 'manager') && state.activeShiftId) {
        await shiftRepo.endShift(state.activeShiftId);
      }

      await SecureStore.deleteItemAsync(AUTH_KEY);
      await SecureStore.deleteItemAsync(CART_KEY);

      setState({
        user: null,
        selectedCartId: null,
        activeShiftId: null,
        assignedCartIds: [],
        isLoading: false,
      });

      console.log('[Auth] Logout successful');
    } catch (error) {
      console.error('[Auth] Logout failed:', error);
    }
  };

  const selectCart = async (cartId: string) => {
    try {
      await SecureStore.setItemAsync(CART_KEY, cartId);
      setState((prev) => ({ ...prev, selectedCartId: cartId }));
      console.log('[Auth] Cart selected:', cartId);
    } catch (error) {
      console.error('[Auth] Failed to select cart:', error);
    }
  };

  const startShift = async (cartId: string, startingCashCents: number = 0) => {
    if (!state.user || (state.user.role !== 'worker' && state.user.role !== 'manager')) {
      throw new Error('Only workers and managers can start shifts');
    }

    try {
      const shift = await shiftRepo.startShift(state.user.id, cartId, startingCashCents);
      setState((prev) => ({ ...prev, activeShiftId: shift.id, selectedCartId: cartId }));
      await SecureStore.setItemAsync(CART_KEY, cartId);
      console.log('[Auth] Shift started:', shift.id);
    } catch (error) {
      console.error('[Auth] Failed to start shift:', error);
      throw error;
    }
  };

  const endShift = async (notes?: string) => {
    if (!state.activeShiftId) {
      throw new Error('No active shift');
    }

    try {
      await shiftRepo.endShift(state.activeShiftId, notes);
      setState((prev) => ({ ...prev, activeShiftId: null }));
      console.log('[Auth] Shift ended');
    } catch (error) {
      console.error('[Auth] Failed to end shift:', error);
      throw error;
    }
  };

  const changePin = async (oldPin: string, newPin: string): Promise<boolean> => {
    if (!state.user) {
      throw new Error('No user logged in');
    }

    try {
      const success = await userRepo.changePin(state.user.id, oldPin, newPin);
      if (success) {
        console.log('[Auth] PIN changed successfully');
      }
      return success;
    } catch (error) {
      console.error('[Auth] Failed to change PIN:', error);
      throw error;
    }
  };

  const canAccessCart = (cartId: string): boolean => {
    if (!state.user) return false;
    if (state.user.role === 'boss') return true;
    if (state.user.role === 'worker') return true;
    if (state.user.role === 'manager') {
      return state.assignedCartIds.length === 0 || state.assignedCartIds.includes(cartId);
    }
    return false;
  };

  const hasPermission = (permission: 'approve_expenses' | 'create_settlements' | 'view_all_data' | 'manage_users'): boolean => {
    if (!state.user) return false;
    if (state.user.role === 'boss') return true;
    if (state.user.role === 'manager') {
      return permission === 'approve_expenses' || permission === 'create_settlements';
    }
    return false;
  };

  return {
    ...state,
    loginWithPin,
    logout,
    selectCart,
    startShift,
    endShift,
    changePin,
    canAccessCart,
    hasPermission,
    isAuthenticated: !!state.user,
    isBoss: state.user?.role === 'boss',
    isWorker: state.user?.role === 'worker',
    isManager: state.user?.role === 'manager',
    canDoWorkerTasks: state.user?.role === 'worker' || state.user?.role === 'manager',
  };
});
