import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';

export default function InventoryRedirectScreen() {
  const { theme } = useTheme();
  const { user, canAccessInventory } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && canAccessInventory) {
      router.replace('/inventory');
    }
  }, [user, canAccessInventory, router]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
