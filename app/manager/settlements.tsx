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
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { SettlementRepository } from '@/lib/repositories/settlement.repository';
import { ShiftRepository, SaleRepository, PaymentRepository } from '@/lib/repositories';
import { ExpenseRepository } from '@/lib/repositories/expense.repository';
import { PayrollRepository } from '@/lib/repositories/payroll.repository';
import { LedgerRepository } from '@/lib/repositories/ledger.repository';
import { SettlementService } from '@/lib/services/settlement.service';
import { format } from 'date-fns';

export default function ManagerSettlementsScreen() {
  const { theme } = useTheme();
  const { user, assignedCartIds } = useAuth();
  const queryClient = useQueryClient();
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [cashCounted, setCashCounted] = useState('');
  const [settlementNotes, setSettlementNotes] = useState('');

  const settlementRepo = new SettlementRepository();
  const shiftRepo = new ShiftRepository();
  const saleRepo = new SaleRepository();
  const paymentRepo = new PaymentRepository();
  const expenseRepo = new ExpenseRepository();
  const payrollRepo = new PayrollRepository();
  const ledgerRepo = new LedgerRepository();

  const { data: unsettledShifts, isLoading: shiftsLoading } = useQuery({
    queryKey: ['unsettled-shifts', assignedCartIds],
    queryFn: () => settlementRepo.getUnsettledShifts(assignedCartIds.length > 0 ? assignedCartIds : undefined),
    enabled: !!user,
  });

  const { data: recentSettlements, isLoading: settlementsLoading } = useQuery({
    queryKey: ['recent-settlements', assignedCartIds],
    queryFn: async () => {
      if (assignedCartIds.length === 0) {
        const allShifts = await shiftRepo.getShifts();
        const allCartIds = [...new Set(allShifts.map((s) => s.cart_id))] as string[];
        return settlementRepo.getSettlementsByCartIds(allCartIds, 20);
      }
      return settlementRepo.getSettlementsByCartIds(assignedCartIds, 20);
    },
    enabled: !!user,
  });

  const { data: selectedShiftData } = useQuery({
    queryKey: ['shift-data', selectedShiftId],
    queryFn: async () => {
      if (!selectedShiftId) return null;

      const shift = await shiftRepo.getShiftById(selectedShiftId);
      if (!shift) return null;

      const sales = (await saleRepo.findAll()).filter(sale => sale.shift_id === selectedShiftId);
      const payments = await Promise.all(
        sales.map(sale => paymentRepo.findBySaleId(sale.id))
      );
      const flatPayments = payments.flat();
      const expenses = await expenseRepo.getApprovedExpensesForShift(selectedShiftId);
      const payrollRule = await payrollRepo.findActiveByWorkerId(shift.worker_id);
      const ledgerData = await ledgerRepo.getAdvancesAndDeductionsForShift(selectedShiftId);

      const totalSalesCents = sales.reduce((sum, sale) => sum + sale.total_cents, 0);
      const cashSalesCents = flatPayments
        .filter(p => p.method === 'CASH')
        .reduce((sum, p) => sum + p.amount_cents, 0);
      const nonCashSalesCents = totalSalesCents - cashSalesCents;
      const approvedExpensesCashDrawerCents = expenses
        .filter(e => e.paid_from === 'CASH_DRAWER')
        .reduce((sum, e) => sum + e.amount_cents, 0);

      const computation = await SettlementService.computeSettlement(
        shift,
        totalSalesCents,
        cashSalesCents,
        nonCashSalesCents,
        approvedExpensesCashDrawerCents,
        payrollRule,
        ledgerData.advances,
        ledgerData.deductions,
        ledgerData.bonuses
      );

      return {
        shift,
        sales,
        expenses,
        computation,
      };
    },
    enabled: !!selectedShiftId,
  });

  const createSettlementMutation = useMutation({
    mutationFn: async (data: {
      shiftId: string;
      cashCountedCents: number;
      notes?: string;
    }) => {
      if (!user || !selectedShiftData) throw new Error('Missing data');

      const { shift, computation } = selectedShiftData;
      const cashDifferenceCents = SettlementService.computeCashDifference(
        computation.cash_expected_cents,
        data.cashCountedCents
      );

      const settlementDay = SettlementService.getSettlementDay(shift);
      const dailyNetSalesCents = await SettlementService.computeDailyNetSales(
        shift.cart_id,
        settlementDay
      );
      const { managerShareCents, ownerShareCents } = SettlementService.computeNetSalesSplit(
        dailyNetSalesCents
      );

      const settlement = await settlementRepo.create(
        data.shiftId,
        shift.cart_id,
        shift.worker_id,
        user.id,
        computation.cash_expected_cents,
        data.cashCountedCents,
        cashDifferenceCents,
        computation.net_due_to_worker_cents,
        computation.net_due_to_boss_cents,
        JSON.stringify(computation),
        settlementDay,
        dailyNetSalesCents,
        managerShareCents,
        ownerShareCents,
        data.notes
      );

      await ledgerRepo.create(
        shift.worker_id,
        'WAGE',
        computation.base_wage_cents,
        user.id,
        shift.id,
        'Base wage for shift'
      );

      if (computation.commission_cents > 0) {
        await ledgerRepo.create(
          shift.worker_id,
          'COMMISSION',
          computation.commission_cents,
          user.id,
          shift.id,
          'Sales commission'
        );
      }

      return settlement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unsettled-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['recent-settlements'] });
      setShowSettlementModal(false);
      setSelectedShiftId(null);
      setCashCounted('');
      setSettlementNotes('');
      Alert.alert('Success', 'Settlement created successfully');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to create settlement');
    },
  });

  const finalizeSettlementMutation = useMutation({
    mutationFn: async (settlementId: string) => {
      if (!user) throw new Error('No user');
      await settlementRepo.finalize(settlementId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recent-settlements'] });
      Alert.alert('Success', 'Settlement finalized');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to finalize settlement');
    },
  });

  const handleCreateSettlement = () => {
    if (!cashCounted || isNaN(parseFloat(cashCounted))) {
      Alert.alert('Error', 'Please enter a valid cash amount');
      return;
    }

    if (!selectedShiftId) return;

    const cashCountedCents = Math.round(parseFloat(cashCounted) * 100);

    Alert.alert(
      'Confirm Settlement',
      `Create settlement with cash counted: ₱${(cashCountedCents / 100).toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: () => {
            createSettlementMutation.mutate({
              shiftId: selectedShiftId,
              cashCountedCents,
              notes: settlementNotes,
            });
          },
        },
      ]
    );
  };

  const handleFinalize = (settlementId: string) => {
    Alert.alert(
      'Finalize Settlement',
      'Once finalized, this settlement cannot be edited. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finalize',
          style: 'destructive',
          onPress: () => finalizeSettlementMutation.mutate(settlementId),
        },
      ]
    );
  };

  if (shiftsLoading || settlementsLoading) {
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
            Unsettled Shifts ({unsettledShifts?.length || 0})
          </Text>
          {unsettledShifts && unsettledShifts.length > 0 ? (
            unsettledShifts.map((shift) => (
              <TouchableOpacity
                key={shift.shift_id}
                style={[styles.shiftCard, { backgroundColor: theme.card }]}
                onPress={() => {
                  setSelectedShiftId(shift.shift_id);
                  setShowSettlementModal(true);
                }}
              >
                <View style={styles.shiftHeader}>
                  <Text style={[styles.workerName, { color: theme.text }]}>
                    {shift.worker_name}
                  </Text>
                  <Text style={[styles.cartName, { color: theme.textSecondary }]}>
                    {shift.cart_name}
                  </Text>
                </View>
                <Text style={[styles.shiftTime, { color: theme.textSecondary }]}>
                  Ended: {format(shift.clock_out, 'MMM d, h:mm a')}
                </Text>
                <View style={[styles.badge, { backgroundColor: theme.warning + '20' }]}>
                  <Text style={[styles.badgeText, { color: theme.warning }]}>
                    Needs Settlement
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <CheckCircle size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                All shifts are settled
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Settlements</Text>
          {recentSettlements && recentSettlements.length > 0 ? (
            recentSettlements.map((settlement) => (
              <View
                key={settlement.id}
                style={[styles.settlementCard, { backgroundColor: theme.card }]}
              >
                <View style={styles.settlementHeader}>
                  <Text style={[styles.workerName, { color: theme.text }]}>
                    {settlement.worker_name}
                  </Text>
                  <View style={styles.statusBadge}>
                    {settlement.status === 'FINALIZED' ? (
                      <View style={[styles.badge, { backgroundColor: theme.success + '20' }]}>
                        <Text style={[styles.badgeText, { color: theme.success }]}>
                          Finalized
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.badge, { backgroundColor: theme.warning + '20' }]}>
                        <Text style={[styles.badgeText, { color: theme.warning }]}>Draft</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={[styles.cartName, { color: theme.textSecondary }]}>
                  {settlement.cart_name}
                </Text>
                <View style={styles.settlementAmounts}>
                  <View style={styles.amountRow}>
                    <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
                      Cash Expected:
                    </Text>
                    <Text style={[styles.amountValue, { color: theme.text }]}>
                      ₱{(settlement.cash_expected_cents / 100).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.amountRow}>
                    <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
                      Cash Counted:
                    </Text>
                    <Text style={[styles.amountValue, { color: theme.text }]}>
                      ₱{(settlement.cash_counted_cents / 100).toFixed(2)}
                    </Text>
                  </View>
                  {settlement.cash_difference_cents !== 0 && (
                    <View style={styles.amountRow}>
                      <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
                        Difference:
                      </Text>
                      <Text
                        style={[
                          styles.amountValue,
                          {
                            color:
                              settlement.cash_difference_cents > 0
                                ? theme.success
                                : theme.error,
                          },
                        ]}
                      >
                        {settlement.cash_difference_cents > 0 ? '+' : ''}₱
                        {(settlement.cash_difference_cents / 100).toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
                {settlement.status === 'DRAFT' && (
                  <TouchableOpacity
                    style={[styles.finalizeButton, { backgroundColor: theme.primary }]}
                    onPress={() => handleFinalize(settlement.id)}
                  >
                    <Text style={styles.finalizeButtonText}>Finalize</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <AlertCircle size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No settlements yet
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={showSettlementModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Create Settlement</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowSettlementModal(false);
                  setSelectedShiftId(null);
                  setCashCounted('');
                  setSettlementNotes('');
                }}
              >
                <XCircle size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedShiftData && (
                <>
                  <View style={styles.summarySection}>
                    <Text style={[styles.summaryTitle, { color: theme.text }]}>
                      Shift Summary
                    </Text>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                        Total Sales:
                      </Text>
                      <Text style={[styles.summaryValue, { color: theme.text }]}>
                        ₱{(selectedShiftData.computation.total_sales_cents / 100).toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                        Cash Expected:
                      </Text>
                      <Text style={[styles.summaryValue, { color: theme.text }]}>
                        ₱{(selectedShiftData.computation.cash_expected_cents / 100).toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                        Base Wage:
                      </Text>
                      <Text style={[styles.summaryValue, { color: theme.text }]}>
                        ₱{(selectedShiftData.computation.base_wage_cents / 100).toFixed(2)}
                      </Text>
                    </View>
                    {selectedShiftData.computation.commission_cents > 0 && (
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                          Commission:
                        </Text>
                        <Text style={[styles.summaryValue, { color: theme.text }]}>
                          ₱{(selectedShiftData.computation.commission_cents / 100).toFixed(2)}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: theme.text }]}>
                      Cash Counted (₱)
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
                      value={cashCounted}
                      onChangeText={setCashCounted}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: theme.text }]}>Notes (Optional)</Text>
                    <TextInput
                      style={[styles.textArea, { backgroundColor: theme.background, color: theme.text }]}
                      value={settlementNotes}
                      onChangeText={setSettlementNotes}
                      multiline
                      numberOfLines={3}
                      placeholder="Add notes..."
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.createButton, { backgroundColor: theme.primary }]}
                    onPress={handleCreateSettlement}
                    disabled={createSettlementMutation.isPending}
                  >
                    {createSettlementMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.createButtonText}>Create Settlement</Text>
                    )}
                  </TouchableOpacity>
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
  shiftCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  workerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  cartName: {
    fontSize: 14,
  },
  shiftTime: {
    fontSize: 12,
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  settlementCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  settlementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    marginLeft: 8,
  },
  settlementAmounts: {
    marginTop: 12,
    gap: 8,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 14,
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  finalizeButton: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  finalizeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  summarySection: {
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  textArea: {
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  createButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
