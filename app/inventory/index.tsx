import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { Archive, Package, ClipboardList, TrendingDown, LogOut } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function InventoryScreen() {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.content}>
        <View style={[styles.header, { backgroundColor: theme.card }]}>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Welcome, {user?.name}
            </Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              Inventory Clerk
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: theme.error + '20' }]}
            onPress={handleLogout}
          >
            <LogOut size={20} color={theme.error} />
          </TouchableOpacity>
        </View>

        <View style={styles.placeholderContainer}>
          <View style={[styles.placeholder, { backgroundColor: theme.card }]}>
            <Archive size={64} color={theme.primary} />
            <Text style={[styles.placeholderTitle, { color: theme.text }]}>
              Inventory Management
            </Text>
            <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
              Full inventory features will be available in Phase 7
            </Text>
          </View>

          <View style={styles.featureGrid}>
            <View style={[styles.featureCard, { backgroundColor: theme.card }]}>
              <Package size={32} color={theme.primary} />
              <Text style={[styles.featureTitle, { color: theme.text }]}>
                Stock Management
              </Text>
              <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>
                Coming soon
              </Text>
            </View>

            <View style={[styles.featureCard, { backgroundColor: theme.card }]}>
              <ClipboardList size={32} color={theme.primary} />
              <Text style={[styles.featureTitle, { color: theme.text }]}>
                Inventory Counts
              </Text>
              <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>
                Coming soon
              </Text>
            </View>

            <View style={[styles.featureCard, { backgroundColor: theme.card }]}>
              <TrendingDown size={32} color={theme.primary} />
              <Text style={[styles.featureTitle, { color: theme.text }]}>
                Usage Reports
              </Text>
              <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>
                Coming soon
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderContainer: {
    padding: 16,
  },
  placeholder: {
    padding: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  placeholderText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  featureGrid: {
    gap: 16,
  },
  featureCard: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  featureDesc: {
    fontSize: 14,
  },
});
