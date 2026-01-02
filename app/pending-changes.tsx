import React, { useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { SyncOutboxRepository, SyncOutboxItem } from '@/lib/repositories/sync-outbox.repository';
import { syncNow } from '@/lib/services/sync.service';

type PendingListItem = {
  id: string;
  tableName: string;
  createdAt: number;
  status: SyncOutboxItem['sync_status'];
  error: string | null;
  label: string;
  isReceipt: boolean;
  sourceId: string;
};

type PendingSection = {
  title: string;
  data: PendingListItem[];
};

const sectionOrder = ['Shifts', 'Sales', 'Expenses', 'Expense Receipts', 'Other'];

function getSectionTitle(tableName: string, isReceipt: boolean): string {
  if (isReceipt) return 'Expense Receipts';
  if (tableName === 'worker_shifts') return 'Shifts';
  if (tableName === 'sales') return 'Sales';
  if (tableName === 'expenses') return 'Expenses';
  return 'Other';
}

export default function PendingChangesScreen() {
  const { theme } = useTheme();
  const syncOutbox = new SyncOutboxRepository();

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['pending-changes-list'],
    queryFn: async () => syncOutbox.listByStatus(['pending', 'syncing', 'failed']),
    refetchInterval: 10000,
  });

  const { sections, receiptPendingCount } = useMemo(() => {
    const items: PendingListItem[] = [];
    let receiptsPending = 0;

    rows.forEach((row) => {
      let payload: any = null;
      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        payload = null;
      }

      const createdAt = payload?.created_at ? Number(payload.created_at) : row.created_at;
      const labelBase = row.table_name === 'worker_shifts'
        ? payload?.clock_out ? 'Shift End' : 'Shift Start'
        : row.table_name === 'sales'
          ? 'Sale'
          : row.table_name === 'expenses'
            ? 'Expense'
            : row.table_name.replace(/_/g, ' ');

      items.push({
        id: row.id,
        tableName: row.table_name,
        createdAt,
        status: row.sync_status,
        error: row.last_error,
        label: labelBase,
        isReceipt: false,
        sourceId: row.row_id,
      });

      if (row.table_name === 'expenses' && typeof payload?.receipt_image_uri === 'string' && !payload.receipt_image_uri.startsWith('http')) {
        receiptsPending += 1;
        items.push({
          id: `${row.id}-receipt`,
          tableName: row.table_name,
          createdAt,
          status: row.sync_status,
          error: row.last_error,
          label: 'Expense Receipt',
          isReceipt: true,
          sourceId: row.row_id,
        });
      }
    });

    const grouped = items.reduce<Record<string, PendingListItem[]>>((acc, item) => {
      const title = getSectionTitle(item.tableName, item.isReceipt);
      acc[title] = acc[title] || [];
      acc[title].push(item);
      return acc;
    }, {});

    const sections = sectionOrder
      .filter((title) => grouped[title]?.length)
      .map((title) => ({
        title,
        data: grouped[title].sort((a, b) => a.createdAt - b.createdAt),
      }));

    return { sections, receiptPendingCount: receiptsPending };
  }, [rows]);

  const handleRetry = async (item: PendingListItem) => {
    await syncOutbox.resetToPending(item.id.replace('-receipt', ''));
    await syncNow('manual_retry');
    refetch();
  };

  const getStatusLabel = (item: PendingListItem) => {
    if (item.status === 'pending' && item.error) {
      return item.error;
    }
    return item.status;
  };

  const getStatusColor = (item: PendingListItem) => {
    if (item.status === 'failed') return theme.error;
    if (item.status === 'syncing') return theme.warning;
    if (item.status === 'pending' && item.error) return theme.warning;
    return theme.text;
  };

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {receiptPendingCount > 0 && (
        <View style={[styles.receiptBanner, { backgroundColor: theme.warning + '15', borderColor: theme.warning }]}>
          <Text style={[styles.receiptBannerText, { color: theme.warning }]}>
            Receipts pending: {receiptPendingCount}
          </Text>
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No pending changes.
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{item.label}</Text>
              <Text style={[styles.cardTime, { color: theme.textSecondary }]}>
                {format(new Date(item.createdAt), 'MMM d, h:mm a')}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>Status:</Text>
              <Text
                style={[
                  styles.statusValue,
                  { color: getStatusColor(item) },
                ]}
              >
                {getStatusLabel(item)}
              </Text>
            </View>
            {item.status === 'failed' && (
              <View style={styles.errorRow}>
                <Text style={[styles.errorText, { color: theme.error }]}>{item.error || 'Sync failed'}</Text>
                <TouchableOpacity
                  style={[styles.retryButton, { borderColor: theme.primary }]}
                  onPress={() => handleRetry(item)}
                >
                  <RefreshCw size={16} color={theme.primary} />
                  <Text style={[styles.retryText, { color: theme.primary }]}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  cardTime: {
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusLabel: {
    fontSize: 12,
  },
  statusValue: {
    fontSize: 12,
    fontWeight: '600' as const,
    textTransform: 'capitalize' as const,
  },
  receiptBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  receiptBannerText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  errorRow: {
    marginTop: 10,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
  },
  retryButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
});
