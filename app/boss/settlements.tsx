import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { DollarSign, ChevronRight, Filter } from 'lucide-react-native';
import { format } from 'date-fns';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { SettlementRepository } from '@/lib/repositories/settlement.repository';
import { ShiftRepository } from '@/lib/repositories';

export default function BossSettlementsScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const settlementRepo = new SettlementRepository();
  const shiftRepo = new ShiftRepository();

  const [filterStatus, setFilterStatus] = useState<'ALL' | 'saved' | 'finalized'>('ALL');

  const { data: settlements, isLoading } = useQuery({
    queryKey: ['boss-settlements', filterStatus],
    queryFn: async () => {
      const shifts = await shiftRepo.getShifts();
      const cartIds = [...new Set(shifts.map((s) => s.cart_id))] as string[];
      const allSettlements = await settlementRepo.getSettlementsByCartIds(cartIds, 100);

      if (filterStatus === 'ALL') return allSettlements;
      return allSettlements.filter((s) => s.status === filterStatus);
    },
    enabled: !!user,
  });

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
              filterStatus === 'saved' && { backgroundColor: theme.warning + '20' },
            ]}
            onPress={() => setFilterStatus('saved')}
          >
            <Text
              style={[
                styles.filterText,
                { color: filterStatus === 'saved' ? theme.warning : theme.textSecondary },
              ]}
            >
              Saved
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              filterStatus === 'finalized' && { backgroundColor: theme.success + '20' },
            ]}
            onPress={() => setFilterStatus('finalized')}
          >
            <Text
              style={[
                styles.filterText,
                { color: filterStatus === 'finalized' ? theme.success : theme.textSecondary },
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
                {settlement.status === 'finalized' ? (
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
