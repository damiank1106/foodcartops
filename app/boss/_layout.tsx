import { Tabs, useRouter } from 'expo-router';
import { LayoutDashboard, Users, Settings, Receipt, Package, Archive } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';

export default function BossLayout() {
  const { theme } = useTheme();
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || (user.role !== 'general_manager' && user.role !== 'developer'))) {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || (user.role !== 'general_manager' && user.role !== 'developer')) {
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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <LayoutDashboard size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
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
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Expenses',
          tabBarIcon: ({ color }) => <Receipt size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: 'Users',
          tabBarIcon: ({ color }) => <Users size={24} color={color} />,
          href: (user?.role === 'general_manager' || user?.role === 'developer') ? '/boss/users' : null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Settings size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="unsettled-shifts"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="shifts"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="cash-differences"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="pending-expenses"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settlements"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="workers"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="debug"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="database"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="how-to-use"
        options={{
          href: null,
          title: 'How to Use App',
        }}
      />
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
