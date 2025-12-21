import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
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
  isLoading: boolean;
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [state, setState] = useState<AuthState>({
    user: null,
    selectedCartId: null,
    activeShiftId: null,
    isLoading: true,
  });

  const userRepo = new UserRepository();
  const shiftRepo = new ShiftRepository();

  useEffect(() => {
    loadAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAuth = async () => {
    if (Platform.OS === 'web') {
      setState({ user: null, selectedCartId: null, activeShiftId: null, isLoading: false });
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

          if (user.role === 'worker') {
            const activeShift = await shiftRepo.getActiveShift(user.id);
            activeShiftId = activeShift?.id || null;
          }

          setState({
            user,
            selectedCartId: cartId,
            activeShiftId,
            isLoading: false,
          });
          return;
        }
      }

      setState({ user: null, selectedCartId: null, activeShiftId: null, isLoading: false });
    } catch (error) {
      console.error('[Auth] Failed to load auth:', error);
      setState({ user: null, selectedCartId: null, activeShiftId: null, isLoading: false });
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
      if (user.role === 'worker') {
        const activeShift = await shiftRepo.getActiveShift(user.id);
        activeShiftId = activeShift?.id || null;
      }

      setState((prev) => ({
        ...prev,
        user,
        activeShiftId,
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
      if (state.user?.role === 'worker' && state.activeShiftId) {
        await shiftRepo.clockOut(state.activeShiftId);
      }

      await SecureStore.deleteItemAsync(AUTH_KEY);
      await SecureStore.deleteItemAsync(CART_KEY);

      setState({
        user: null,
        selectedCartId: null,
        activeShiftId: null,
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

  const startShift = async (cartId: string) => {
    if (!state.user || state.user.role !== 'worker') {
      throw new Error('Only workers can start shifts');
    }

    try {
      const shift = await shiftRepo.clockIn(state.user.id, cartId);
      setState((prev) => ({ ...prev, activeShiftId: shift.id, selectedCartId: cartId }));
      await SecureStore.setItemAsync(CART_KEY, cartId);
      console.log('[Auth] Shift started:', shift.id);
    } catch (error) {
      console.error('[Auth] Failed to start shift:', error);
      throw error;
    }
  };

  const endShift = async () => {
    if (!state.activeShiftId) {
      throw new Error('No active shift');
    }

    try {
      await shiftRepo.clockOut(state.activeShiftId);
      setState((prev) => ({ ...prev, activeShiftId: null }));
      console.log('[Auth] Shift ended');
    } catch (error) {
      console.error('[Auth] Failed to end shift:', error);
      throw error;
    }
  };

  return {
    ...state,
    loginWithPin,
    logout,
    selectCart,
    startShift,
    endShift,
    isAuthenticated: !!state.user,
    isBoss: state.user?.role === 'boss',
    isWorker: state.user?.role === 'worker',
  };
});
