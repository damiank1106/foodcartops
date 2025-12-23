import { useState, useEffect } from 'react';
import { Platform, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import createContextHook from '@nkzw/create-context-hook';
import { User } from '../types';
import { UserRepository, ShiftRepository } from '../repositories';

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

  useEffect(() => {
    loadAuth();
  }, []);

  const loadAuth = async () => {
    if (Platform.OS === 'web') {
      setState({ user: null, selectedCartId: null, activeShiftId: null, assignedCartIds: [], isLoading: false });
      return;
    }

    try {
      const userRepo = new UserRepository();
      const shiftRepo = new ShiftRepository();

      const authData = await SecureStore.getItemAsync(AUTH_KEY);
      const cartId = await SecureStore.getItemAsync(CART_KEY);

      if (authData) {
        const { userId } = JSON.parse(authData);
        const user = await userRepo.findById(userId);

        if (user) {
          let activeShiftId: string | null = null;
          let selectedCart = cartId;
          let assignedCartIds: string[] = [];

          if (user.role === 'worker') {
            const activeShift = await shiftRepo.getActiveShift(user.id);
            activeShiftId = activeShift?.id || null;
            if (activeShift && !selectedCart) {
              selectedCart = activeShift.cart_id;
              await SecureStore.setItemAsync(CART_KEY, activeShift.cart_id);
            }
          } else if (user.role === 'inventory_clerk') {
            activeShiftId = null;
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
      const userRepo = new UserRepository();
      const shiftRepo = new ShiftRepository();

      const user = await userRepo.findByPin(pin);

      if (!user) {
        return false;
      }

      await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({ userId: user.id }));

      let activeShiftId: string | null = null;
      let assignedCartIds: string[] = [];

      if (user.role === 'worker') {
        const activeShift = await shiftRepo.getActiveShift(user.id);
        activeShiftId = activeShift?.id || null;
      } else if (user.role === 'inventory_clerk') {
        activeShiftId = null;
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
      if (state.user?.role === 'worker') {
        const shiftRepo = new ShiftRepository();
        const activeShift = await shiftRepo.getActiveShift(state.user.id);
        
        if (activeShift) {
          if (Platform.OS !== 'web') {
            Alert.alert(
              'Active Shift',
              'Please End the Shift before logging out',
              [{ text: 'OK' }]
            );
          }
          return;
        }
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

  const startShift = async (shiftIdOrCartId: string, startingCashCents: number = 0) => {
    if (!state.user || state.user.role !== 'worker') {
      throw new Error('Only workers can start shifts');
    }

    try {
      const shiftRepo = new ShiftRepository();
      
      const assignedShifts = await shiftRepo.getAssignedShifts(state.user.id);
      const assignedShift = assignedShifts.find(s => s.id === shiftIdOrCartId || s.cart_id === shiftIdOrCartId);
      
      if (assignedShift) {
        await shiftRepo.startShift(assignedShift.id, startingCashCents);
        setState((prev) => ({ ...prev, activeShiftId: assignedShift.id, selectedCartId: assignedShift.cart_id }));
        await SecureStore.setItemAsync(CART_KEY, assignedShift.cart_id);
        console.log('[Auth] Assigned shift started:', assignedShift.id);
      } else {
        const shift = await shiftRepo.startShift(state.user.id, shiftIdOrCartId, startingCashCents);
        setState((prev) => ({ ...prev, activeShiftId: shift.id, selectedCartId: shiftIdOrCartId }));
        await SecureStore.setItemAsync(CART_KEY, shiftIdOrCartId);
        console.log('[Auth] New shift started:', shift.id);
      }
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
      const shiftRepo = new ShiftRepository();
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
      const userRepo = new UserRepository();
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
    if (state.user.role === 'boss' || state.user.role === 'boss2') return true;
    if (state.user.role === 'worker') return true;
    if (state.user.role === 'inventory_clerk') return true;
    return false;
  };

  const hasPermission = (permission: 'approve_expenses' | 'create_settlements' | 'view_all_data' | 'manage_users'): boolean => {
    if (!state.user) return false;
    if (state.user.role === 'boss' || state.user.role === 'boss2' || state.user.role === 'developer') return true;
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
    isBoss: state.user?.role === 'boss' || state.user?.role === 'boss2',
    isDeveloper: state.user?.role === 'developer',
    isWorker: state.user?.role === 'worker',
    isInventoryClerk: state.user?.role === 'inventory_clerk',
    canDoWorkerTasks: state.user?.role === 'worker',
    canAccessInventory: state.user?.role === 'boss' || state.user?.role === 'boss2' || state.user?.role === 'inventory_clerk' || state.user?.role === 'developer',
  };
});
