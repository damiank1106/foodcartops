import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, Check, X, Bookmark } from 'lucide-react-native';
import { format } from 'date-fns';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { ExpenseRepository } from '@/lib/repositories/expense.repository';
import { BossSavedItemsRepository } from '@/lib/repositories/boss-saved-items.repository';

export default function PendingExpensesScreen() {
  const { theme } = useTheme();
  const { user, assignedCartIds, isBoss } = useAuth();
  const queryClient = useQueryClient();
  const expenseRepo = new ExpenseRepository();
  const savedItemsRepo = new BossSavedItemsRepository();

  const { data: pendingExpenses, isLoading } = useQuery({
    queryKey: ['pending-expenses', assignedCartIds, isBoss],
    queryFn: async () => {
      const allExpenses = await expenseRepo.findWithDetails({ status: 'SUBMITTED' });
      
      if (isBoss) {
        return allExpenses;
      }
      return [];
    },
    enabled: !!isBoss,
  });

  const approveMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      if (!user) throw new Error('Not authenticated');
      await expenseRepo.approve(expenseId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['boss-monitoring-stats'] });
      Alert.alert('Success', 'Expense approved');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to approve expense');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      if (!user) throw new Error('Not authenticated');
      await expenseRepo.reject(expenseId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['boss-monitoring-stats'] });
      Alert.alert('Success', 'Expense rejected');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to reject expense');
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ expenseId, category, submitterName, amount }: { expenseId: string; category: string; submitterName: string; amount: number }) => {
      if (!user) throw new Error('Not authenticated');
      const existing = await savedItemsRepo.findByLinkedEntity('expense', expenseId);
      if (existing) {
        Alert.alert('Already Saved', 'This expense is already in your saved items');
        return;
      }
      await savedItemsRepo.create({
        type: 'EXCEPTION',
        title: `Pending Expense: ${category}`,
        notes: `Submitted by ${submitterName}. Amount: ₱${amount.toFixed(2)}`,
        severity: amount > 1000 ? 'HIGH' : 'MEDIUM',
        linked_entity_type: 'expense',
        linked_entity_id: expenseId,
        created_by_user_id: user.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-items'] });
      Alert.alert('Success', 'Expense saved to your Saved tab');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to save expense');
    },
  });

  if (!user || !isBoss) {
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
          <Text style={[styles.title, { color: theme.text }]}>Pending Expenses</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {pendingExpenses?.length || 0} expense{pendingExpenses?.length !== 1 ? 's' : ''} awaiting approval
          </Text>
        </View>

        {pendingExpenses && pendingExpenses.length > 0 ? (
          pendingExpenses.map((expense) => (
            <View key={expense.id} style={[styles.expenseCard, { backgroundColor: theme.card }]}>
              <View style={styles.cardContent}>
                <View style={styles.expenseHeader}>
                  <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
                    <ShoppingBag size={24} color={theme.primary} />
                  </View>
                  <View style={styles.expenseInfo}>
                    <Text style={[styles.category, { color: theme.text }]}>{expense.category}</Text>
                    <Text style={[styles.submitter, { color: theme.textSecondary }]}>
                      {expense.submitted_by_name} • {expense.cart_name}
                    </Text>
                    <Text style={[styles.expenseTime, { color: theme.textSecondary }]}>
                      {format(expense.created_at, 'MMM d, yyyy • h:mm a')}
                    </Text>
                  </View>
                  <View style={styles.amountContainer}>
                    <Text style={[styles.amountText, { color: theme.text }]}>
                      ₱{(expense.amount_cents / 100).toFixed(2)}
                    </Text>
                    <Text style={[styles.paidFromLabel, { color: theme.textSecondary }]}>
                      {expense.paid_from.replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                {expense.notes && (
                  <Text style={[styles.notes, { color: theme.textSecondary }]}>{expense.notes}</Text>
                )}

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.saveIconButton, { backgroundColor: theme.primary + '20' }]}
                    onPress={() => saveMutation.mutate({
                      expenseId: expense.id,
                      category: expense.category,
                      submitterName: expense.submitted_by_name,
                      amount: expense.amount_cents / 100,
                    })}
                    disabled={saveMutation.isPending}
                  >
                    <Bookmark size={18} color={theme.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rejectButton, { backgroundColor: theme.error + '20' }]}
                    onPress={() => rejectMutation.mutate(expense.id)}
                    disabled={rejectMutation.isPending || approveMutation.isPending}
                  >
                    <X size={18} color={theme.error} />
                    <Text style={[styles.rejectButtonText, { color: theme.error }]}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.approveButton, { backgroundColor: theme.success }]}
                    onPress={() => approveMutation.mutate(expense.id)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                  >
                    <Check size={18} color="#fff" />
                    <Text style={styles.approveButtonText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <ShoppingBag size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>All Clear!</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No pending expense approvals
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
  expenseCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardContent: {
    flex: 1,
  },
  expenseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  expenseInfo: {
    flex: 1,
  },
  category: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  submitter: {
    fontSize: 14,
    marginBottom: 4,
  },
  expenseTime: {
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
  paidFromLabel: {
    fontSize: 11,
  },
  notes: {
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  saveIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  rejectButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  approveButtonText: {
    color: '#fff',
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
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
