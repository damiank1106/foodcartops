import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { DollarSign, ChevronRight, Filter, Trash2 } from 'lucide-react-native';
import { format } from 'date-fns';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { SettlementRepository } from '@/lib/repositories/settlement.repository';
import { onSyncComplete } from '@/lib/services/sync.service';

export default function BossSettlementsScreen() {
  const { theme } = useTheme();
  const { user, isBoss, isDeveloper } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const settlementRepo = new SettlementRepository();

  const [filterStatus, setFilterStatus] = useState<'ALL' | 'SAVED' | 'FINALIZED'>('ALL');

  useEffect(() => {
    const unsubscribe = onSyncComplete(() => {
      console.log('[Settlements] Sync completed, refetching settlements');
      queryClient.invalidateQueries({ queryKey: ['boss-settlements'] });
      queryClient.invalidateQueries({ queryKey: ['settlement-notifications'] });
    });
    return unsubscribe;
  }, [queryClient]);

  useEffect(() => {
    (async () => {
      const { NotificationRepository } = await import('@/lib/repositories/notification.repository');
      const notifRepo = new NotificationRepository();
      await notifRepo.markAllSeenByType('settlement_incoming');
      queryClient.invalidateQueries({ queryKey: ['settlement-notifications'] });
      console.log('[Settlements] Marked all settlement notifications as seen');
    })();
  }, [queryClient]);

  const { data: settlements, isLoading } = useQuery({
    queryKey: ['boss-settlements', filterStatus],
    queryFn: async () => {
      console.log('[Settlements Tab] Fetching all settlements from local DB');
      const allSettlements = await settlementRepo.getAllSettlements(100);
      console.log(`[Settlements Tab] Got ${allSettlements.length} settlements from DB`);
      
      if (allSettlements.length > 0) {
        console.log('[Settlements Tab] First 3 settlements:', allSettlements.slice(0, 3).map(s => ({
          id: s.id,
          status: s.status,
          worker_name: s.worker_name,
          cart_name: s.cart_name,
          total_cents: s.total_cents
        })));
      }

      if (filterStatus === 'ALL') {
        console.log(`[Settlements Tab] Returning all ${allSettlements.length} settlements`);
        return allSettlements;
      }
      const filtered = allSettlements.filter((s) => s.status === filterStatus);
      console.log(`[Settlements Tab] Filtered to ${filtered.length} ${filterStatus} settlements (looking for status=${filterStatus})`);
      return filtered;
    },
    enabled: !!(user && (isBoss || isDeveloper)),
  });

  const deleteSettlementMutation = useMutation({
    mutationFn: async (settlementId: string) => {
      if (!user?.id) throw new Error('No user');
      await settlementRepo.delete(settlementId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boss-settlements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-all-settlements'] });
      queryClient.invalidateQueries({ queryKey: ['boss-monitoring-stats'] });
      Alert.alert('Success', 'Settlement deleted');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to delete settlement: ${error}`);
    },
  });

  const handleDeleteSettlement = (settlementId: string, workerName: string) => {
    Alert.alert(
      'Delete Settlement',
      `Are you sure you want to delete ${workerName}'s settlement? This will also delete all related items and sync the changes to Supabase.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteSettlementMutation.mutate(settlementId),
        },
      ]
    );
  };

  const handleSettlementPress = (shiftId: string) => {
    router.push(`/settlement/${shiftId}` as any);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>All Settlements</Text>
        <View style={styles.filterContainer}>
          <Filter size={16} color={theme.textSecondary} />
          <TouchableOpacity
            style={[
              styles.filterButton,
              filterStatus === 'ALL' && { backgroundColor: theme.primary + '20' },
            ]}
            onPress={() => setFilterStatus('ALL')}
          >
            <Text
              style={[
                styles.filterText,
                { color: filterStatus === 'ALL' ? theme.primary : theme.textSecondary },
              ]}
            >
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              filterStatus === 'SAVED' && { backgroundColor: theme.warning + '20' },
            ]}
            onPress={() => setFilterStatus('SAVED')}
          >
            <Text
              style={[
                styles.filterText,
                { color: filterStatus === 'SAVED' ? theme.warning : theme.textSecondary },
              ]}
            >
              Saved
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              filterStatus === 'FINALIZED' && { backgroundColor: theme.success + '20' },
            ]}
            onPress={() => setFilterStatus('FINALIZED')}
          >
            <Text
              style={[
                styles.filterText,
                { color: filterStatus === 'FINALIZED' ? theme.success : theme.textSecondary },
              ]}
            >
              Finalized
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {settlements && settlements.length > 0 ? (
          settlements.map((settlement) => (
            <TouchableOpacity
              key={settlement.id}
              style={[styles.settlementCard, { backgroundColor: theme.card }]}
              onPress={() => handleSettlementPress(settlement.shift_id)}
            >
              <View style={styles.settlementHeader}>
                <TouchableOpacity
                  style={styles.settlementTouchable}
                  onPress={() => handleSettlementPress(settlement.shift_id)}
                >
                  <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
                    <DollarSign size={20} color={theme.primary} />
                  </View>
                  <View style={styles.settlementInfo}>
                    <Text style={[styles.workerName, { color: theme.text }]}>
                      {settlement.worker_name}
                    </Text>
                    <Text style={[styles.cartName, { color: theme.textSecondary }]}>
                      {settlement.cart_name}
                    </Text>
                    <Text style={[styles.settlementDate, { color: theme.textSecondary }]}>
                      {format(settlement.created_at, 'MMM d, yyyy • h:mm a')}
                    </Text>
                  </View>
                  <ChevronRight size={20} color={theme.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteButton, { backgroundColor: theme.error + '20' }]}
                  onPress={() => handleDeleteSettlement(settlement.id, settlement.worker_name)}
                >
                  <Trash2 size={18} color={theme.error} />
                </TouchableOpacity>
              </View>

              <View style={styles.settlementDetails}>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                    Cash:
                  </Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    ₱{(settlement.cash_cents / 100).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                    GCash:
                  </Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    ₱{(settlement.gcash_cents / 100).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                    Card:
                  </Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    ₱{(settlement.card_cents / 100).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary, fontWeight: '600' }]}>
                    Total:
                  </Text>
                  <Text style={[styles.detailValue, { color: theme.primary, fontWeight: '700', fontSize: 16 }]}>
                    ₱{(settlement.total_cents / 100).toFixed(2)}
                  </Text>
                </View>
              </View>

              <View style={styles.statusContainer}>
                {settlement.status === 'FINALIZED' ? (
                  <View style={[styles.statusBadge, { backgroundColor: theme.success + '20' }]}>
                    <Text style={[styles.statusText, { color: theme.success }]}>Finalized</Text>
                  </View>
                ) : (
                  <View style={[styles.statusBadge, { backgroundColor: theme.warning + '20' }]}>
                    <Text style={[styles.statusText, { color: theme.warning }]}>Draft</Text>
                  </View>
                )}
                {settlement.finalized_by_name && (
                  <Text style={[styles.finalizedBy, { color: theme.textSecondary }]}>
                    by {settlement.finalized_by_name}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <DollarSign size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Settlements</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {filterStatus === 'ALL'
                ? 'No settlements have been created yet'
                : `No ${filterStatus.toLowerCase()} settlements found`}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
  },
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 16,
    paddingTop: 8,
  },
  settlementCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  settlementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  settlementTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settlementInfo: {
    flex: 1,
  },
  workerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  cartName: {
    fontSize: 14,
    marginBottom: 2,
  },
  settlementDate: {
    fontSize: 12,
  },
  settlementDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 13,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  finalizedBy: {
    fontSize: 11,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
