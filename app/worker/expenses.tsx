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
  Platform,
  Image,
  KeyboardAvoidingView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Camera, X, Receipt, FileText, AlertCircle, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { ExpenseRepository, AuditRepository, CartRepository } from '@/lib/repositories';
import type { PaidFrom } from '@/lib/types';
import { format } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import SyncProgressModal from '@/components/SyncProgressModal';

const EXPENSE_CATEGORIES = [
  'Supplies',
  'Ingredients',
  'Utilities',
  'Maintenance',
  'Transportation',
  'Other',
];

const PAID_FROM_OPTIONS: { value: PaidFrom; label: string; description: string }[] = [
  { value: 'CASH_DRAWER', label: 'Cash Drawer', description: 'From shift cash' },
  { value: 'PERSONAL', label: 'Personal', description: 'Your own money' },
  { value: 'COMPANY', label: 'Company Card', description: 'Company payment' },
];

export default function WorkerExpensesScreen() {
  const { theme } = useTheme();
  const { user, selectedCartId, activeShiftId, selectCart } = useAuth();
  const queryClient = useQueryClient();
  const [availableCarts, setAvailableCarts] = React.useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [category, setCategory] = useState<string>('Supplies');
  const [amount, setAmount] = useState<string>('');
  const [paidFrom, setPaidFrom] = useState<PaidFrom>('CASH_DRAWER');
  const [notes, setNotes] = useState<string>('');
  const [receiptUri, setReceiptUri] = useState<string>('');
  const [showSyncModal, setShowSyncModal] = useState<boolean>(false);

  const expenseRepo = React.useMemo(() => new ExpenseRepository(), []);
  const auditRepo = React.useMemo(() => new AuditRepository(), []);
  const cartRepo = React.useMemo(() => new CartRepository(), []);

  React.useEffect(() => {
    const loadCarts = async () => {
      const carts = await cartRepo.findAll();
      setAvailableCarts(carts);
      if (carts.length > 0 && !selectedCartId) {
        selectCart(carts[0].id);
      }
    };
    loadCarts();
  }, [cartRepo, selectCart, selectedCartId]);

  const { data: expenses, isLoading } = useQuery({
    queryKey: ['worker-expenses', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const allExpenses = await expenseRepo.findWithDetails({ submitted_by_user_id: user.id });
      return allExpenses.filter(e => e.created_at >= sevenDaysAgo);
    },
    enabled: !!user?.id,
  });

  const createExpenseMutation = useMutation({
    mutationFn: async (data: {
      category: string;
      amount_cents: number;
      paid_from: PaidFrom;
      notes?: string;
      receipt_image_uri?: string;
    }) => {
      console.log('[Expense] Creating expense with data:', data);
      console.log('[Expense] User ID:', user?.id);
      console.log('[Expense] Selected Cart ID:', selectedCartId);
      console.log('[Expense] Active Shift ID:', activeShiftId);

      if (!user) {
        throw new Error('User not found');
      }

      let cartId = selectedCartId;
      if (!cartId && availableCarts.length > 0) {
        cartId = availableCarts[0].id;
        if (cartId) {
          selectCart(cartId);
        }
      }

      if (!cartId) {
        throw new Error('No cart available');
      }

      const expense = await expenseRepo.create({
        shift_id: activeShiftId || null,
        cart_id: cartId,
        submitted_by_user_id: user.id,
        category: data.category,
        amount_cents: data.amount_cents,
        paid_from: data.paid_from,
        notes: data.notes || undefined,
        receipt_image_uri: data.receipt_image_uri || undefined,
        status: 'SUBMITTED',
      });

      console.log('[Expense] Created expense:', expense.id);

      await auditRepo.log({
        user_id: user.id,
        entity_type: 'expense',
        entity_id: expense.id,
        action: 'create',
        new_data: JSON.stringify(expense),
      });

      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['shift-expenses'] });
      setShowAddModal(false);
      resetForm();
      setShowSyncModal(true);
    },
    onError: (error: Error) => {
      console.error('[Expense] Failed to create expense:', error);
      Alert.alert('Error', `Failed to submit expense: ${error.message}`);
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      if (!user?.id) throw new Error('User not found');
      await expenseRepo.softDelete(expenseId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-expenses'] });
      Alert.alert('Success', 'Expense deleted');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to delete expense');
    },
  });

  React.useEffect(() => {
    const cleanupOldExpenses = async () => {
      if (!user?.id) return;
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const allExpenses = await expenseRepo.findWithDetails({ submitted_by_user_id: user.id });
      const oldDrafts = allExpenses.filter(e => 
        e.created_at < sevenDaysAgo && e.status === 'DRAFT'
      );
      
      for (const expense of oldDrafts) {
        await expenseRepo.softDelete(expense.id, user.id);
      }
      
      if (oldDrafts.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['worker-expenses'] });
      }
    };
    
    cleanupOldExpenses();
  }, [user?.id, expenseRepo, auditRepo, queryClient]);

  const handleDeleteExpense = (expenseId: string) => {
    Alert.alert(
      'Delete Expense',
      'Are you sure you want to delete this expense?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteExpenseMutation.mutate(expenseId) },
      ]
    );
  };

  const resetForm = () => {
    setCategory('Supplies');
    setAmount('');
    setPaidFrom('CASH_DRAWER');
    setNotes('');
    setReceiptUri('');
  };

  const handleTakePhoto = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Camera is not available on web');
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is required to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images' as any,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setReceiptUri(result.assets[0].uri);
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Gallery permission is required to select images');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setReceiptUri(result.assets[0].uri);
    }
  };

  const handleSubmit = () => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    Alert.alert(
      'Submit Expense',
      'Submit this expense for review?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'default',
          onPress: () => {
            const cents = Math.round(parseFloat(amount) * 100);
            createExpenseMutation.mutate({
              category,
              amount_cents: cents,
              paid_from: paidFrom,
              notes: notes || undefined,
              receipt_image_uri: receiptUri || undefined,
            });
          },
        },
      ]
    );
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
      {!activeShiftId && (
        <View style={[styles.infoBanner, { backgroundColor: theme.primary + '20' }]}>
          <AlertCircle size={20} color={theme.primary} />
          <View style={styles.infoBannerText}>
            <Text style={[styles.infoBannerTitle, { color: theme.primary }]}>
              No active shift
            </Text>
            <Text style={[styles.infoBannerSubtitle, { color: theme.primary }]}>
              Expenses will be saved as drafts until you start a shift
            </Text>
          </View>
        </View>
      )}
      
      <View style={[styles.retentionBanner, { backgroundColor: theme.warning + '15' }]}>
        <Text style={[styles.retentionText, { color: theme.textSecondary }]}>
          Draft expenses older than 7 days are automatically removed.
        </Text>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>My Expenses</Text>
            <TouchableOpacity
              style={[
                styles.addButton,
                { backgroundColor: theme.primary },
              ]}
              onPress={() => setShowAddModal(true)}
            >
              <Plus size={20} color="#FFF" />
              <Text style={styles.addButtonText}>Add Expense</Text>
            </TouchableOpacity>
          </View>

          {expenses && expenses.length > 0 ? (
            expenses.map((expense) => (
              <View key={expense.id} style={[styles.expenseCard, { backgroundColor: theme.card }]}>
                <View style={styles.expenseHeader}>
                  <View style={styles.expenseLeft}>
                    <View style={[styles.categoryBadge, { backgroundColor: theme.primary + '20' }]}>
                      <Receipt size={16} color={theme.primary} />
                      <Text style={[styles.categoryText, { color: theme.primary }]}>
                        {expense.category}
                      </Text>
                    </View>
                    <Text style={[styles.expenseAmount, { color: theme.text }]}>
                      ₱{(expense.amount_cents / 100).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.expenseHeaderRight}>
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
                    <TouchableOpacity
                      style={[styles.deleteButton, { backgroundColor: theme.error + '20' }]}
                      onPress={() => handleDeleteExpense(expense.id)}
                    >
                      <Trash2 size={16} color={theme.error} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.expenseDetails}>
                  <Text style={[styles.expenseLabel, { color: theme.textSecondary }]}>
                    Paid from:{' '}
                    <Text style={[styles.expenseValue, { color: theme.text }]}>
                      {expense.paid_from.replace('_', ' ')}
                    </Text>
                  </Text>
                  {expense.notes && (
                    <Text style={[styles.expenseNotes, { color: theme.textSecondary }]}>
                      {expense.notes}
                    </Text>
                  )}
                  <Text style={[styles.expenseDate, { color: theme.textSecondary }]}>
                    {format(new Date(expense.created_at), 'MMM d, yyyy h:mm a')}
                  </Text>
                  {expense.receipt_image_uri && (
                    <Image
                      source={{ uri: expense.receipt_image_uri }}
                      style={styles.receiptThumbnail}
                    />
                  )}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Receipt size={64} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No expenses yet
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
                Tap &ldquo;Add Expense&rdquo; to submit your first expense
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Add Expense</Text>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={styles.closeButton}
              >
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
              <Text style={[styles.label, { color: theme.text }]}>Category</Text>
              <View style={styles.categoryGrid}>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryOption,
                      { backgroundColor: theme.background },
                      category === cat && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        { color: theme.text },
                        category === cat && { color: theme.primary, fontWeight: '600' as const },
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { color: theme.text }]}>Amount</Text>
              <View style={[styles.inputContainer, { backgroundColor: theme.background }]}>
                <Text style={[styles.currencySymbol, { color: theme.textSecondary }]}>₱</Text>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="decimal-pad"
                />
              </View>

              <Text style={[styles.label, { color: theme.text }]}>Paid From</Text>
              {PAID_FROM_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.paidFromOption,
                    { backgroundColor: theme.background },
                    paidFrom === option.value && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
                  ]}
                  onPress={() => setPaidFrom(option.value)}
                >
                  <View style={styles.paidFromLeft}>
                    <Text
                      style={[
                        styles.paidFromLabel,
                        { color: theme.text },
                        paidFrom === option.value && { color: theme.primary, fontWeight: '600' as const },
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text style={[styles.paidFromDescription, { color: theme.textSecondary }]}>
                      {option.description}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      { borderColor: theme.border },
                      paidFrom === option.value && { borderColor: theme.primary, backgroundColor: theme.primary },
                    ]}
                  >
                    {paidFrom === option.value && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
              ))}

              <Text style={[styles.label, { color: theme.text }]}>Notes (Optional)</Text>
              <TextInput
                style={[
                  styles.textArea,
                  { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                ]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add any additional details..."
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.label, { color: theme.text }]}>Receipt Photo (Optional)</Text>
              {receiptUri ? (
                <View style={styles.receiptPreview}>
                  <Image source={{ uri: receiptUri }} style={styles.receiptImage} />
                  <TouchableOpacity
                    style={[styles.removeReceiptButton, { backgroundColor: theme.error }]}
                    onPress={() => setReceiptUri('')}
                  >
                    <X size={20} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.receiptButtons}>
                  <TouchableOpacity
                    style={[styles.receiptButton, { backgroundColor: theme.background }]}
                    onPress={handleTakePhoto}
                  >
                    <Camera size={24} color={theme.primary} />
                    <Text style={[styles.receiptButtonText, { color: theme.text }]}>Take Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.receiptButton, { backgroundColor: theme.background }]}
                    onPress={handlePickImage}
                  >
                    <FileText size={24} color={theme.primary} />
                    <Text style={[styles.receiptButtonText, { color: theme.text }]}>Choose File</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.footerButton, { backgroundColor: theme.background }]}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={[styles.footerButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footerButton, styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={handleSubmit}
                disabled={createExpenseMutation.isPending}
              >
                {createExpenseMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={[styles.footerButtonText, { color: '#FFF' }]}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SyncProgressModal
        visible={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        onSuccess={() => {
          console.log('[Worker Expense] Sync completed after expense submission');
        }}
        reason="submit_expense"
        title="Synchronizing with Database"
        allowCancel={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  warningText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  infoBannerText: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 2,
  },
  infoBannerSubtitle: {
    fontSize: 12,
  },
  retentionBanner: {
    padding: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 8,
  },
  retentionText: {
    fontSize: 12,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600' as const,
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
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  expenseLeft: {
    flex: 1,
  },
  expenseHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  expenseAmount: {
    fontSize: 22,
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
  expenseDetails: {
    gap: 6,
  },
  expenseLabel: {
    fontSize: 14,
  },
  expenseValue: {
    fontWeight: '600' as const,
  },
  expenseNotes: {
    fontSize: 14,
    fontStyle: 'italic' as const,
  },
  expenseDate: {
    fontSize: 12,
  },
  receiptThumbnail: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600' as const,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
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
  },
  modalScrollContent: {
    paddingBottom: 180,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
    marginTop: 16,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryOptionText: {
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600' as const,
  },
  paidFromOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  paidFromLeft: {
    flex: 1,
  },
  paidFromLabel: {
    fontSize: 14,
    marginBottom: 2,
  },
  paidFromDescription: {
    fontSize: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFF',
  },
  textArea: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  receiptButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  receiptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  receiptButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  receiptPreview: {
    position: 'relative',
  },
  receiptImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  removeReceiptButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  footerButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  footerButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
