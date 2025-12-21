import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Database, RefreshCw, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { getDatabase, resetDatabase } from '@/lib/database/init';
import { resetSeed } from '@/lib/utils/seed';
import { useRouter } from 'expo-router';
import { UserRepository } from '@/lib/repositories';
import { hashPin } from '@/lib/utils/crypto';

interface TableCount {
  name: string;
  count: number;
}

interface UserDebugInfo {
  id: string;
  name: string;
  role: string;
  has_pin: boolean;
  pin_hash_preview: string;
}

export default function DebugScreen() {
  const { theme } = useTheme();
  const router = useRouter();

  const { data: tableCounts, isLoading, refetch } = useQuery({
    queryKey: ['debug-table-counts'],
    queryFn: async () => {
      if (Platform.OS === 'web') {
        return [];
      }

      const db = await getDatabase();
      const tables = [
        'users',
        'carts',
        'products',
        'sales',
        'sale_items',
        'worker_shifts',
        'audit_logs',
        'sync_queue',
        'app_settings',
      ];

      const counts: TableCount[] = [];
      for (const table of tables) {
        const result = await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${table}`
        );
        counts.push({ name: table, count: result?.count || 0 });
      }

      return counts;
    },
  });

  const { data: userDebug } = useQuery({
    queryKey: ['debug-users'],
    queryFn: async () => {
      if (Platform.OS === 'web') {
        return [];
      }

      const userRepo = new UserRepository();
      const users = await userRepo.findAll();

      const debugInfo: UserDebugInfo[] = users.map((user) => ({
        id: user.id,
        name: user.name,
        role: user.role,
        has_pin: !!user.pin,
        pin_hash_preview: user.pin ? user.pin.substring(0, 16) + '...' : 'N/A',
      }));

      return debugInfo;
    },
  });

  const { data: pinTests } = useQuery({
    queryKey: ['debug-pin-tests'],
    queryFn: async () => {
      if (Platform.OS === 'web') {
        return [];
      }

      const testPins = ['0000', '1111', '2222', '3333'];
      const results = [];

      for (const pin of testPins) {
        const hash = await hashPin(pin);
        results.push({
          pin,
          hash_preview: hash.substring(0, 16) + '...',
        });
      }

      return results;
    },
  });

  const handleResetDatabase = () => {
    Alert.alert(
      'Reset Database',
      'This will delete ALL data and reseed the database. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetSeed();
              await resetDatabase();
              Alert.alert('Success', 'Database reset. Please restart the app.', [
                {
                  text: 'OK',
                  onPress: () => {
                    router.replace('/' as any);
                  },
                },
              ]);
            } catch (error) {
              console.error('[Debug] Reset failed:', error);
              Alert.alert('Error', 'Failed to reset database');
            }
          },
        },
      ]
    );
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.emptyState}>
          <Database size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Database debug is only available on mobile
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={[styles.header, { backgroundColor: theme.card }]}>
          <Database size={32} color={theme.primary} />
          <Text style={[styles.title, { color: theme.text }]}>Database Debug</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Table counts and database management
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Table Counts</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <RefreshCw size={20} color={theme.primary} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</Text>
          ) : (
            tableCounts?.map((table) => (
              <View key={table.name} style={styles.tableRow}>
                <Text style={[styles.tableName, { color: theme.text }]}>{table.name}</Text>
                <View style={[styles.countBadge, { backgroundColor: theme.primary + '20' }]}>
                  <Text style={[styles.countText, { color: theme.primary }]}>{table.count}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Users & PINs</Text>
          {userDebug?.map((user) => (
            <View key={user.id} style={styles.userRow}>
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: theme.text }]}>{user.name}</Text>
                <Text style={[styles.userRole, { color: theme.textSecondary }]}>{user.role}</Text>
              </View>
              <Text style={[styles.userPin, { color: theme.textSecondary }]}>
                {user.pin_hash_preview}
              </Text>
            </View>
          ))}
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>PIN Hash Tests</Text>
          <Text style={[styles.helpText, { color: theme.textSecondary }]}>
            Current hashes for demo PINs:
          </Text>
          {pinTests?.map((test) => (
            <View key={test.pin} style={styles.pinTestRow}>
              <Text style={[styles.pinTestLabel, { color: theme.text }]}>PIN {test.pin}:</Text>
              <Text style={[styles.pinTestHash, { color: theme.textSecondary }]}>
                {test.hash_preview}
              </Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.resetButton, { backgroundColor: theme.error }]}
          onPress={handleResetDatabase}
        >
          <Trash2 size={20} color="#FFF" />
          <Text style={styles.resetText}>Reset Database</Text>
        </TouchableOpacity>

        <View style={[styles.warning, { backgroundColor: theme.warning + '20' }]}>
          <Text style={[styles.warningText, { color: theme.warning }]}>
            ⚠️ Resetting will delete all data and require app restart
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    marginTop: 12,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  section: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  loadingText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  tableName: {
    fontSize: 16,
    fontFamily: 'monospace' as const,
  },
  countBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 12,
    marginBottom: 16,
  },
  resetText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  warning: {
    padding: 16,
    borderRadius: 12,
  },
  warningText: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500' as const,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  userRole: {
    fontSize: 12,
    textTransform: 'uppercase' as const,
  },
  userPin: {
    fontSize: 10,
    fontFamily: 'monospace' as const,
  },
  helpText: {
    fontSize: 12,
    marginBottom: 12,
  },
  pinTestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  pinTestLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  pinTestHash: {
    fontSize: 11,
    fontFamily: 'monospace' as const,
  },
});
