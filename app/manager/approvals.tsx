import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Image,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, AlertCircle, Eye } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { ExpenseRepository } from '@/lib/repositories/expense.repository';
import { format } from 'date-fns';
import type { ExpenseWithDetails } from '@/lib/types';

export default function ManagerApprovalsScreen() {
  const { theme } = useTheme();
  const { user, assignedCartIds } = useAuth();
  const queryClient = useQueryClient();
  const [selectedExpense, setSelectedExpense] = useState<ExpenseWithDetails | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');

  const expenseRepo = new ExpenseRepository();

  const { data: pendingExpenses, isLoading } = useQuery({
    queryKey: ['pending-expenses', assignedCartIds],
    queryFn: async () => {
      const allPending = await expenseRepo.findWithDetails({ status: 'SUBMITTED' });
      if (assignedCartIds.length === 0) {
        return allPending;
      }
      return allPending.filter((expense) => assignedCartIds.includes(expense.cart_id));
    },
    enabled: !!user,
  });

  const { data: recentReviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ['recent-reviews', assignedCartIds],
    queryFn: async () => {
      const allReviewed = await expenseRepo.findWithDetails();
      const reviewed = allReviewed.filter((e) => e.status !== 'SUBMITTED');
      if (assignedCartIds.length === 0) {
        return reviewed.slice(0, 20);
      }
      return reviewed.filter((e) => assignedCartIds.includes(e.cart_id)).slice(0, 20);
    },
    enabled: !!user,
  });

  const approveMutation = useMutation({
    mutationFn: async (data: { expenseId: string; notes?: string }) => {
      if (!user) throw new Error('No user');
      await expenseRepo.approve(data.expenseId, user.id, data.notes);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['recent-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['shift-expenses'] });
      setShowDetailModal(false);
      setSelectedExpense(null);
      setReviewNotes('');
      Alert.alert('Success', 'Expense approved');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to approve expense');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (data: { expenseId: string; notes?: string }) => {
      if (!user) throw new Error('No user');
      await expenseRepo.reject(data.expenseId, user.id, data.notes);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['recent-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['shift-expenses'] });
      setShowDetailModal(false);
      setSelectedExpense(null);
      setReviewNotes('');
      Alert.alert('Success', 'Expense rejected');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to reject expense');
    },
  });

  const handleApprove = (expense: ExpenseWithDetails) => {
    Alert.alert(
      'Approve Expense',
      `Approve ${expense.category} expense for ₱${(expense.amount_cents / 100).toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => {
            approveMutation.mutate({ expenseId: expense.id, notes: reviewNotes });
          },
        },
      ]
    );
  };

  const handleReject = (expense: ExpenseWithDetails) => {
    Alert.alert(
      'Reject Expense',
      `Reject ${expense.category} expense for ₱${(expense.amount_cents / 100).toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () => {
            rejectMutation.mutate({ expenseId: expense.id, notes: reviewNotes });
          },
        },
      ]
    );
  };

  if (isLoading || reviewsLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Pending Approvals ({pendingExpenses?.length || 0})
          </Text>
          {pendingExpenses && pendingExpenses.length > 0 ? (
            pendingExpenses.map((expense) => (
              <View key={expense.id} style={[styles.expenseCard, { backgroundColor: theme.card }]}>
                <View style={styles.expenseHeader}>
                  <View style={styles.expenseInfo}>
                    <Text style={[styles.category, { color: theme.text }]}>{expense.category}</Text>
                    <Text style={[styles.submitter, { color: theme.textSecondary }]}>
                      by {expense.submitted_by_name}
                    </Text>
                  </View>
                  <Text style={[styles.amount, { color: theme.primary }]}>
                    ₱{(expense.amount_cents / 100).toFixed(2)}
                  </Text>
                </View>

                <View style={styles.expenseDetails}>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      Paid From:
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {expense.paid_from.replace('_', ' ')}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Cart:</Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {expense.cart_name}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Date:</Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {format(expense.created_at, 'MMM d, h:mm a')}
                    </Text>
                  </View>
                  {expense.notes && (
                    <Text style={[styles.notes, { color: theme.textSecondary }]}>
                      {expense.notes}
                    </Text>
                  )}
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.viewButton, { backgroundColor: theme.background }]}
                    onPress={() => {
                      setSelectedExpense(expense);
                      setShowDetailModal(true);
                    }}
                  >
                    <Eye size={16} color={theme.text} />
                    <Text style={[styles.viewButtonText, { color: theme.text }]}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.approveButton, { backgroundColor: theme.success }]}
                    onPress={() => {
                      setSelectedExpense(expense);
                      handleApprove(expense);
                    }}
                  >
                    <CheckCircle size={16} color="#fff" />
                    <Text style={styles.approveButtonText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rejectButton, { backgroundColor: theme.error }]}
                    onPress={() => {
                      setSelectedExpense(expense);
                      handleReject(expense);
                    }}
                  >
                    <XCircle size={16} color="#fff" />
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <CheckCircle size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No pending approvals
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Reviews</Text>
          {recentReviews && recentReviews.length > 0 ? (
            recentReviews.map((expense) => (
              <View key={expense.id} style={[styles.expenseCard, { backgroundColor: theme.card }]}>
                <View style={styles.expenseHeader}>
                  <View style={styles.expenseInfo}>
                    <Text style={[styles.category, { color: theme.text }]}>{expense.category}</Text>
                    <Text style={[styles.submitter, { color: theme.textSecondary }]}>
                      by {expense.submitted_by_name}
                    </Text>
                  </View>
                  <View style={styles.statusBadge}>
                    {expense.status === 'APPROVED' ? (
                      <View style={[styles.badge, { backgroundColor: theme.success + '20' }]}>
                        <Text style={[styles.badgeText, { color: theme.success }]}>Approved</Text>
                      </View>
                    ) : (
                      <View style={[styles.badge, { backgroundColor: theme.error + '20' }]}>
                        <Text style={[styles.badgeText, { color: theme.error }]}>Rejected</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={[styles.amount, { color: theme.textSecondary }]}>
                  ₱{(expense.amount_cents / 100).toFixed(2)}
                </Text>
                {expense.reviewed_at && (
                  <Text style={[styles.reviewDate, { color: theme.textSecondary }]}>
                    Reviewed: {format(expense.reviewed_at, 'MMM d, h:mm a')}
                  </Text>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <AlertCircle size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No reviewed expenses yet
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Expense Details</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowDetailModal(false);
                  setSelectedExpense(null);
                  setReviewNotes('');
                }}
              >
                <XCircle size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedExpense && (
                <>
                  <View style={styles.detailGroup}>
                    <Text style={[styles.detailGroupLabel, { color: theme.textSecondary }]}>
                      Category
                    </Text>
                    <Text style={[styles.detailGroupValue, { color: theme.text }]}>
                      {selectedExpense.category}
                    </Text>
                  </View>

                  <View style={styles.detailGroup}>
                    <Text style={[styles.detailGroupLabel, { color: theme.textSecondary }]}>
                      Amount
                    </Text>
                    <Text style={[styles.detailGroupValue, { color: theme.text }]}>
                      ₱{(selectedExpense.amount_cents / 100).toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.detailGroup}>
                    <Text style={[styles.detailGroupLabel, { color: theme.textSecondary }]}>
                      Paid From
                    </Text>
                    <Text style={[styles.detailGroupValue, { color: theme.text }]}>
                      {selectedExpense.paid_from.replace('_', ' ')}
                    </Text>
                  </View>

                  <View style={styles.detailGroup}>
                    <Text style={[styles.detailGroupLabel, { color: theme.textSecondary }]}>
                      Submitted By
                    </Text>
                    <Text style={[styles.detailGroupValue, { color: theme.text }]}>
                      {selectedExpense.submitted_by_name}
                    </Text>
                  </View>

                  <View style={styles.detailGroup}>
                    <Text style={[styles.detailGroupLabel, { color: theme.textSecondary }]}>
                      Cart
                    </Text>
                    <Text style={[styles.detailGroupValue, { color: theme.text }]}>
                      {selectedExpense.cart_name}
                    </Text>
                  </View>

                  {selectedExpense.notes && (
                    <View style={styles.detailGroup}>
                      <Text style={[styles.detailGroupLabel, { color: theme.textSecondary }]}>
                        Notes
                      </Text>
                      <Text style={[styles.detailGroupValue, { color: theme.text }]}>
                        {selectedExpense.notes}
                      </Text>
                    </View>
                  )}

                  {selectedExpense.receipt_image_uri && (
                    <View style={styles.detailGroup}>
                      <Text style={[styles.detailGroupLabel, { color: theme.textSecondary }]}>
                        Receipt
                      </Text>
                      <Image
                        source={{ uri: selectedExpense.receipt_image_uri }}
                        style={styles.receiptImage}
                        resizeMode="contain"
                      />
                    </View>
                  )}

                  {selectedExpense.status === 'SUBMITTED' && (
                    <>
                      <View style={styles.inputGroup}>
                        <Text style={[styles.inputLabel, { color: theme.text }]}>
                          Review Notes (Optional)
                        </Text>
                        <TextInput
                          style={[styles.textArea, { backgroundColor: theme.background, color: theme.text }]}
                          value={reviewNotes}
                          onChangeText={setReviewNotes}
                          multiline
                          numberOfLines={3}
                          placeholder="Add notes..."
                          placeholderTextColor={theme.textSecondary}
                        />
                      </View>

                      <View style={styles.modalActions}>
                        <TouchableOpacity
                          style={[styles.modalApproveButton, { backgroundColor: theme.success }]}
                          onPress={() => handleApprove(selectedExpense)}
                          disabled={approveMutation.isPending}
                        >
                          {approveMutation.isPending ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <>
                              <CheckCircle size={20} color="#fff" />
                              <Text style={styles.modalApproveButtonText}>Approve</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.modalRejectButton, { backgroundColor: theme.error }]}
                          onPress={() => handleReject(selectedExpense)}
                          disabled={rejectMutation.isPending}
                        >
                          {rejectMutation.isPending ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <>
                              <XCircle size={20} color="#fff" />
                              <Text style={styles.modalRejectButtonText}>Reject</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </>
              )}
            </ScrollView>
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
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  expenseCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
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
    fontSize: 12,
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 12,
  },
  expenseDetails: {
    marginBottom: 12,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 12,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  notes: {
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 4,
  },
  viewButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 4,
  },
  approveButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 4,
  },
  rejectButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    marginLeft: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reviewDate: {
    fontSize: 11,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalBody: {
    padding: 20,
  },
  detailGroup: {
    marginBottom: 16,
  },
  detailGroupLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  detailGroupValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  receiptImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  textArea: {
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalApproveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  modalApproveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalRejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  modalRejectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
