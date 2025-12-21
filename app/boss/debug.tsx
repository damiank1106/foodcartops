import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Database, RefreshCw, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { getDatabase, resetDatabase } from '@/lib/database/init';
import { resetSeed } from '@/lib/utils/seed';
import { useRouter } from 'expo-router';

interface TableCount {
  name: string;
  count: number;
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
});
