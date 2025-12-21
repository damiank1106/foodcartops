import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bookmark } from 'lucide-react-native';
import { format } from 'date-fns';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { SettlementRepository } from '@/lib/repositories/settlement.repository';
import { BossSavedItemsRepository } from '@/lib/repositories/boss-saved-items.repository';

export default function CashDifferencesScreen() {
  const { theme } = useTheme();
  const { user, assignedCartIds, isBoss, isManager } = useAuth();
  const queryClient = useQueryClient();
  const settlementRepo = new SettlementRepository();
  const savedItemsRepo = new BossSavedItemsRepository();

  const { data: cashDifferences, isLoading } = useQuery({
    queryKey: ['cash-differences', assignedCartIds, isBoss, isManager],
    queryFn: () => {
      if (isBoss) {
        return settlementRepo.getCashDifferences();
      } else if (isManager) {
        return settlementRepo.getCashDifferences(assignedCartIds);
      }
      return Promise.resolve([]);
    },
    enabled: !!(isBoss || isManager),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ settlementId, workerName, amount }: { settlementId: string; workerName: string; amount: number }) => {
      if (!user) throw new Error('Not authenticated');
      const existing = await savedItemsRepo.findByLinkedEntity('settlement', settlementId);
      if (existing) {
        Alert.alert('Already Saved', 'This settlement is already in your saved items');
        return;
      }
      await savedItemsRepo.create({
        type: 'EXCEPTION',
        title: `Cash Difference: ${workerName}`,
        notes: `Cash difference of ₱${Math.abs(amount).toFixed(2)} (${amount > 0 ? 'Over' : 'Short'})`,
        severity: Math.abs(amount) > 500 ? 'HIGH' : 'MEDIUM',
        linked_entity_type: 'settlement',
        linked_entity_id: settlementId,
        created_by_user_id: user.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-items'] });
      Alert.alert('Success', 'Cash difference saved to your Saved tab');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to save cash difference');
    },
  });

  if (!user || (!isBoss && !isManager)) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.error }]}>Access Denied</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Cash Differences</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {cashDifferences?.length || 0} settlement{cashDifferences?.length !== 1 ? 's' : ''} with discrepancies
          </Text>
        </View>

        {cashDifferences && cashDifferences.length > 0 ? (
          cashDifferences.map((diff) => (
            <View key={diff.settlement_id} style={[styles.diffCard, { backgroundColor: theme.card }]}>
              <View style={styles.diffContent}>
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: (diff.cash_difference_cents > 0 ? theme.success : theme.error) + '20' },
                  ]}
                >
                  <AlertTriangle size={24} color={diff.cash_difference_cents > 0 ? theme.success : theme.error} />
                </View>
                <View style={styles.diffInfo}>
                  <Text style={[styles.workerName, { color: theme.text }]}>{diff.worker_name}</Text>
                  <Text style={[styles.diffTime, { color: theme.textSecondary }]}>
                    {format(diff.created_at, 'MMM d, yyyy • h:mm a')}
                  </Text>
                </View>
                <View style={styles.amountContainer}>
                  <Text
                    style={[
                      styles.amountText,
                      { color: diff.cash_difference_cents > 0 ? theme.success : theme.error },
                    ]}
                  >
                    {diff.cash_difference_cents > 0 ? '+' : ''}₱{(Math.abs(diff.cash_difference_cents) / 100).toFixed(2)}
                  </Text>
                  <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
                    {diff.cash_difference_cents > 0 ? 'Over' : 'Short'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.primary + '20' }]}
                onPress={() => saveMutation.mutate({
                  settlementId: diff.settlement_id,
                  workerName: diff.worker_name,
                  amount: diff.cash_difference_cents / 100,
                })}
                disabled={saveMutation.isPending}
              >
                <Bookmark size={18} color={theme.primary} />
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <AlertTriangle size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Perfect Match!</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No cash discrepancies found
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
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  diffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  diffContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  diffInfo: {
    flex: 1,
  },
  workerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  diffTime: {
    fontSize: 12,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  amountLabel: {
    fontSize: 12,
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
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
