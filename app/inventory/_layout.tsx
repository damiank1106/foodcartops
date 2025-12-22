import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Archive, LayoutDashboard, Package, Users, UserCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';

export default function InventoryLayout() {
  const { theme } = useTheme();
  const { user, isLoading, canAccessInventory, isBoss } = useAuth();
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
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.border,
        },
        headerStyle: {
          backgroundColor: theme.card,
        },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}
    >
      {isBoss && (
        <>
          <Tabs.Screen
            name="dashboard"
            options={{
              title: 'Dashboard',
              tabBarIcon: ({ color }) => <LayoutDashboard size={24} color={color} />,
            }}
            listeners={{
              tabPress: (e) => {
                e.preventDefault();
                router.replace('/boss');
              },
            }}
          />
          <Tabs.Screen
            name="index"
            options={{
              title: 'Inventory',
              tabBarIcon: ({ color }) => <Archive size={24} color={color} />,
            }}
          />
          <Tabs.Screen
            name="products"
            options={{
              title: 'Products',
              tabBarIcon: ({ color }) => <Package size={24} color={color} />,
            }}
            listeners={{
              tabPress: (e) => {
                e.preventDefault();
                router.replace('/boss/products');
              },
            }}
          />
          <Tabs.Screen
            name="users"
            options={{
              title: 'Users',
              tabBarIcon: ({ color }) => <Users size={24} color={color} />,
            }}
            listeners={{
              tabPress: (e) => {
                e.preventDefault();
                router.replace('/boss/users');
              },
            }}
          />
        </>
      )}
      {!isBoss && (
        <>
          <Tabs.Screen
            name="index"
            options={{
              title: 'Inventory',
              tabBarIcon: ({ color }) => <Archive size={24} color={color} />,
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'Profile',
              tabBarIcon: ({ color }) => <UserCircle size={24} color={color} />,
            }}
          />
        </>
      )}
      <Tabs.Screen
        name="dashboard"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          href: null,
        }}
      />
      {isBoss && (
        <Tabs.Screen
          name="profile"
          options={{
            href: null,
          }}
        />
      )}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
