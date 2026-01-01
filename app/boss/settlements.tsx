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
import { DollarSign, Filter, Trash2 } from 'lucide-react-native';
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
            <View
              key={settlement.id}
              style={[styles.settlementCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <TouchableOpacity
                style={styles.settlementMainArea}
                onPress={() => handleSettlementPress(settlement.shift_id)}
                activeOpacity={0.7}
              >
                <View style={styles.settlementTopRow}>
                  <View style={[styles.iconContainer, { backgroundColor: theme.primary + '15' }]}>
                    <DollarSign size={24} color={theme.primary} />
                  </View>
                  <View style={styles.settlementInfo}>
                    <Text style={[styles.workerName, { color: theme.text }]}>
                      {settlement.worker_name}
                    </Text>
                    <Text style={[styles.cartName, { color: theme.textSecondary }]}>
                      {settlement.cart_name}
                    </Text>
                  </View>
                  <View style={styles.rightSection}>
                    {settlement.status === 'FINALIZED' ? (
                      <View style={[styles.statusBadge, { backgroundColor: theme.success + '15' }]}>
                        <Text style={[styles.statusText, { color: theme.success }]}>Finalized</Text>
                      </View>
                    ) : (
                      <View style={[styles.statusBadge, { backgroundColor: theme.warning + '15' }]}>
                        <Text style={[styles.statusText, { color: theme.warning }]}>Saved</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                <View style={styles.paymentRow}>
                  <View style={styles.paymentItem}>
                    <Text style={[styles.paymentLabel, { color: theme.textSecondary }]}>Cash</Text>
                    <Text style={[styles.paymentValue, { color: theme.text }]}>
                      ₱{(settlement.cash_cents / 100).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.paymentItem}>
                    <Text style={[styles.paymentLabel, { color: theme.textSecondary }]}>GCash</Text>
                    <Text style={[styles.paymentValue, { color: theme.text }]}>
                      ₱{(settlement.gcash_cents / 100).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.paymentItem}>
                    <Text style={[styles.paymentLabel, { color: theme.textSecondary }]}>Card</Text>
                    <Text style={[styles.paymentValue, { color: theme.text }]}>
                      ₱{(settlement.card_cents / 100).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.totalRow, { backgroundColor: theme.primary + '08' }]}>
                  <Text style={[styles.totalLabel, { color: theme.text }]}>Total Amount</Text>
                  <Text style={[styles.totalValue, { color: theme.primary }]}>
                    ₱{(settlement.total_cents / 100).toFixed(2)}
                  </Text>
                </View>

                <Text style={[styles.settlementDate, { color: theme.textSecondary }]}>
                  {format(settlement.created_at, 'MMM d, yyyy • h:mm a')}
                  {settlement.finalized_by_name && ` • by ${settlement.finalized_by_name}`}
                </Text>
              </TouchableOpacity>

              <View style={[styles.actionRow, { borderTopColor: theme.border }]}>
                <TouchableOpacity
                  style={[styles.deleteButton, { backgroundColor: theme.error + '10' }]}
                  onPress={() => handleDeleteSettlement(settlement.id, settlement.worker_name)}
                >
                  <Trash2 size={20} color={theme.error} />
                  <Text style={[styles.deleteButtonText, { color: theme.error }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
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
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'hidden',
  },
  settlementMainArea: {
    padding: 16,
  },
  settlementTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settlementInfo: {
    flex: 1,
  },
  workerName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  cartName: {
    fontSize: 14,
    fontWeight: '500',
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  paymentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  paymentLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  paymentValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  settlementDate: {
    fontSize: 12,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
