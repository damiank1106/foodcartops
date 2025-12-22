import { Stack, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';

export default function InventoryLayout() {
  const { theme } = useTheme();
  const { user, isLoading, canAccessInventory } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || !canAccessInventory)) {
      router.replace('/');
    }
  }, [isLoading, user, canAccessInventory, router]);

  if (isLoading || !user || !canAccessInventory) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.card,
        },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Inventory',
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
