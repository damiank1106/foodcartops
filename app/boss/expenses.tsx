import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Receipt, Eye, X, Clock } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { ExpenseRepository, AuditRepository } from '@/lib/repositories';
import type { ExpenseWithDetails } from '@/lib/types';
import { format } from 'date-fns';

export default function BossExpensesScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedExpense, setSelectedExpense] = useState<ExpenseWithDetails | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [filter, setFilter] = useState<'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ALL'>('SUBMITTED');

  const expenseRepo = new ExpenseRepository();
  const auditRepo = new AuditRepository();

  const { data: expenses, isLoading } = useQuery({
    queryKey: ['boss-expenses', filter],
    queryFn: () => {
      if (filter === 'ALL') {
        return expenseRepo.findWithDetails();
      }
      return expenseRepo.findWithDetails({ status: filter });
    },
  });

  const { data: pendingCount } = useQuery({
    queryKey: ['pending-expenses-count'],
    queryFn: () => expenseRepo.getPendingCount(),
    refetchInterval: 30000,
  });

  const reviewMutation = useMutation({
    mutationFn: async (data: { expenseId: string; status: 'APPROVED' | 'REJECTED' }) => {
      if (!user) throw new Error('User not found');

      await expenseRepo.updateStatus(data.expenseId, data.status, user.id);

      await auditRepo.log({
        user_id: user.id,
        entity_type: 'expense',
        entity_id: data.expenseId,
        action: data.status.toLowerCase(),
        new_data: JSON.stringify({ status: data.status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boss-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['pending-expenses-count'] });
      queryClient.invalidateQueries({ queryKey: ['worker-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['shift-expenses'] });
      setShowDetailModal(false);
      setSelectedExpense(null);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to update expense status');
    },
  });

  const handleApprove = (expenseId: string) => {
    Alert.alert('Approve Expense', 'Are you sure you want to approve this expense?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        style: 'default',
        onPress: () => reviewMutation.mutate({ expenseId, status: 'APPROVED' }),
      },
    ]);
  };

  const handleReject = (expenseId: string) => {
    Alert.alert('Reject Expense', 'Are you sure you want to reject this expense?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: () => reviewMutation.mutate({ expenseId, status: 'REJECTED' }),
      },
    ]);
  };

  const handleViewDetails = (expense: ExpenseWithDetails) => {
    setSelectedExpense(expense);
    setShowDetailModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return theme.success;
      case 'REJECTED':
        return theme.error;
      default:
        return theme.warning || '#F59E0B';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0) + status.slice(1).toLowerCase();
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
        <Text style={[styles.title, { color: theme.text }]}>Expense Approvals</Text>
        {pendingCount !== undefined && pendingCount > 0 && (
          <View style={[styles.badge, { backgroundColor: theme.error }]}>
            <Text style={styles.badgeText}>{pendingCount}</Text>
          </View>
        )}
      </View>

      <View style={styles.filterRow}>
        {(['SUBMITTED', 'APPROVED', 'REJECTED', 'ALL'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterButton,
              { backgroundColor: theme.card },
              filter === f && { backgroundColor: theme.primary },
            ]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterText,
                { color: theme.text },
                filter === f && { color: '#FFF', fontWeight: '600' as const },
              ]}
            >
              {f === 'ALL' ? 'All' : getStatusLabel(f)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          {expenses && expenses.length > 0 ? (
            expenses.map((expense) => (
              <View key={expense.id} style={[styles.expenseCard, { backgroundColor: theme.card }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardLeft}>
                    <View style={[styles.categoryBadge, { backgroundColor: theme.primary + '20' }]}>
                      <Receipt size={14} color={theme.primary} />
                      <Text style={[styles.categoryText, { color: theme.primary }]}>
                        {expense.category}
                      </Text>
                    </View>
                    <Text style={[styles.amount, { color: theme.text }]}>
                      ₱{(expense.amount_cents / 100).toFixed(2)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(expense.status) + '20' },
                    ]}
                  >
                    <Text style={[styles.statusText, { color: getStatusColor(expense.status) }]}>
                      {getStatusLabel(expense.status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>
                    Submitted by:{' '}
                    <Text style={[styles.value, { color: theme.text }]}>
                      {expense.submitted_by_name}
                    </Text>
                  </Text>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>
                    Cart:{' '}
                    <Text style={[styles.value, { color: theme.text }]}>{expense.cart_name}</Text>
                  </Text>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>
                    Paid from:{' '}
                    <Text style={[styles.value, { color: theme.text }]}>
                      {expense.paid_from.replace('_', ' ')}
                    </Text>
                  </Text>
                  {expense.notes && (
                    <Text style={[styles.notes, { color: theme.textSecondary }]} numberOfLines={2}>
                      {expense.notes}
                    </Text>
                  )}
                  <View style={styles.metaRow}>
                    <Clock size={12} color={theme.textSecondary} />
                    <Text style={[styles.date, { color: theme.textSecondary }]}>
                      {format(new Date(expense.created_at), 'MMM d, h:mm a')}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: theme.background }]}
                    onPress={() => handleViewDetails(expense)}
                  >
                    <Eye size={18} color={theme.primary} />
                    <Text style={[styles.actionButtonText, { color: theme.primary }]}>View</Text>
                  </TouchableOpacity>

                  {expense.status === 'SUBMITTED' && (
                    <>
                      <TouchableOpacity
                        style={[
                          styles.actionButton,
                          styles.approveButton,
                          { backgroundColor: theme.success },
                        ]}
                        onPress={() => handleApprove(expense.id)}
                        disabled={reviewMutation.isPending}
                      >
                        <CheckCircle size={18} color="#FFF" />
                        <Text style={[styles.actionButtonText, { color: '#FFF' }]}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.actionButton,
                          styles.rejectButton,
                          { backgroundColor: theme.error },
                        ]}
                        onPress={() => handleReject(expense.id)}
                        disabled={reviewMutation.isPending}
                      >
                        <XCircle size={18} color="#FFF" />
                        <Text style={[styles.actionButtonText, { color: '#FFF' }]}>Reject</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Receipt size={64} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No {filter !== 'ALL' ? filter.toLowerCase() : ''} expenses
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showDetailModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Expense Details</Text>
              <TouchableOpacity
                onPress={() => setShowDetailModal(false)}
                style={styles.closeButton}
              >
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedExpense && (
              <ScrollView style={styles.modalScroll}>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Amount</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    ₱{(selectedExpense.amount_cents / 100).toFixed(2)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                    Category
                  </Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {selectedExpense.category}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                    Paid From
                  </Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {selectedExpense.paid_from.replace('_', ' ')}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                    Submitted By
                  </Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {selectedExpense.submitted_by_name}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Cart</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {selectedExpense.cart_name}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Date</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {format(new Date(selectedExpense.created_at), 'MMM d, yyyy h:mm a')}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Status</Text>
                  <View
                    style={[
                      styles.detailStatusBadge,
                      { backgroundColor: getStatusColor(selectedExpense.status) + '20' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.detailStatusText,
                        { color: getStatusColor(selectedExpense.status) },
                      ]}
                    >
                      {getStatusLabel(selectedExpense.status)}
                    </Text>
                  </View>
                </View>

                {selectedExpense.notes && (
                  <View style={[styles.detailRowFull, { marginTop: 16 }]}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Notes</Text>
                    <Text style={[styles.detailNotes, { color: theme.text }]}>
                      {selectedExpense.notes}
                    </Text>
                  </View>
                )}

                {selectedExpense.receipt_image_uri && (
                  <View style={[styles.detailRowFull, { marginTop: 16 }]}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      Receipt
                    </Text>
                    <Image
                      source={{ uri: selectedExpense.receipt_image_uri }}
                      style={styles.receiptImage}
                    />
                  </View>
                )}

                {selectedExpense.approved_by_name && (
                  <View style={[styles.detailRow, { marginTop: 16 }]}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      Reviewed By
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {selectedExpense.approved_by_name}
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}

            {selectedExpense?.status === 'SUBMITTED' && (
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: theme.error }]}
                  onPress={() => handleReject(selectedExpense.id)}
                  disabled={reviewMutation.isPending}
                >
                  {reviewMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <XCircle size={20} color="#FFF" />
                      <Text style={[styles.modalButtonText, { color: '#FFF' }]}>Reject</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: theme.success }]}
                  onPress={() => handleApprove(selectedExpense.id)}
                  disabled={reviewMutation.isPending}
                >
                  {reviewMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <CheckCircle size={20} color="#FFF" />
                      <Text style={[styles.modalButtonText, { color: '#FFF' }]}>Approve</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700' as const,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterText: {
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 0,
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardLeft: {
    flex: 1,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  amount: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  cardBody: {
    gap: 6,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
  },
  value: {
    fontWeight: '600' as const,
  },
  notes: {
    fontSize: 13,
    fontStyle: 'italic' as const,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  date: {
    fontSize: 11,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  approveButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  rejectButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  closeButton: {
    padding: 4,
  },
  modalScroll: {
    padding: 20,
    paddingBottom: 40,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  detailRowFull: {
    paddingVertical: 12,
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  detailNotes: {
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  detailStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  detailStatusText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  receiptImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginTop: 12,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  modalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
