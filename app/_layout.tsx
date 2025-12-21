import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider } from '@/lib/contexts/auth.context';
import { ThemeProvider } from '@/lib/contexts/theme.context';
import { seedDatabase } from '@/lib/utils/seed';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="worker" options={{ headerShown: false }} />
      <Stack.Screen name="boss" options={{ headerShown: false }} />
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
    } catch (error) {
      console.error('[App] Init failed:', error);
      setIsReady(true);
      await SplashScreen.hideAsync();
    }
  };

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
        <AuthProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <RootLayoutNav />
          </GestureHandlerRootView>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
