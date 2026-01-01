import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, View, AppState } from 'react-native';
import * as Network from 'expo-network';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider } from '@/lib/contexts/auth.context';
import { ThemeProvider } from '@/lib/contexts/theme.context';
import { ToastProvider } from '@/lib/contexts/toast.context';
import { seedDatabase } from '@/lib/utils/seed';
import { syncNow, onSyncComplete } from '@/lib/services/sync.service';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="worker" options={{ headerShown: false }} />
      <Stack.Screen name="boss" options={{ headerShown: false }} />
      <Stack.Screen name="inventory" options={{ headerShown: false }} />
      <Stack.Screen name="pending-changes" options={{ title: 'Pending Changes' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    try {
      await seedDatabase();
      setIsReady(true);
      await SplashScreen.hideAsync();
      
      syncNow('app_start').catch((err: any) => {
        console.log('[App] Initial sync failed:', err);
      });
    } catch (error) {
      console.error('[App] Init failed:', error);
      setIsReady(true);
      await SplashScreen.hideAsync();
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        console.log('[App] App became active, triggering sync');
        syncNow('app_resume').catch((err: any) => {
          console.log('[App] Resume sync failed:', err);
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const wasOffline = { current: false };
    const subscription = Network.addNetworkStateListener((state) => {
      const isOnline = !!state.isConnected && !!state.isInternetReachable;
      if (isOnline && wasOffline.current) {
        console.log('[App] Network recovered, triggering sync');
        syncNow('network_recovered').catch((err: any) => {
          console.log('[App] Network recovered sync failed:', err);
        });
      }
      wasOffline.current = !isOnline;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkNetworkAndSync = async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();
        if (networkState.isConnected && networkState.isInternetReachable) {
          console.log('[App] Network became reachable, triggering sync');
          await syncNow('network_check');
        }
      } catch (error) {
        console.log('[App] Network check failed:', error);
      }
    };

    const setupAutoSync = async () => {
      try {
        const savedInterval = await AsyncStorage.getItem('sync_interval');
        const interval = savedInterval ? parseInt(savedInterval, 10) : 300000;
        
        if (interval > 0) {
          console.log(`[App] Setting up auto-sync with interval: ${interval}ms`);
          intervalId = setInterval(checkNetworkAndSync, interval);
        } else {
          console.log('[App] Manual sync mode - no auto-sync');
        }
      } catch {
        console.log('[App] Failed to load sync interval, using default 5 minutes');
        intervalId = setInterval(checkNetworkAndSync, 300000);
      }
    };

    setupAutoSync();

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onSyncComplete(() => {
      console.log('[App] Sync completed, invalidating product queries');
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <RootLayoutNav />
            </GestureHandlerRootView>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
