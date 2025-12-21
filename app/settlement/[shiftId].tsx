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
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { CheckCircle, Lock, TrendingUp } from 'lucide-react-native';
import { format } from 'date-fns';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { SettlementRepository } from '@/lib/repositories/settlement.repository';
import { ShiftRepository, SaleRepository, PaymentRepository } from '@/lib/repositories';
import { ExpenseRepository } from '@/lib/repositories/expense.repository';
import { PayrollRepository } from '@/lib/repositories/payroll.repository';
import { LedgerRepository } from '@/lib/repositories/ledger.repository';
import { SettlementService } from '@/lib/services/settlement.service';

export default function SettlementEditorScreen() {
  const { theme } = useTheme();
  const { user, isBoss } = useAuth();
  const { shiftId } = useLocalSearchParams<{ shiftId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [cashCounted, setCashCounted] = useState('');
  const [notes, setNotes] = useState('');

  const settlementRepo = new SettlementRepository();
  const shiftRepo = new ShiftRepository();
  const saleRepo = new SaleRepository();
  const paymentRepo = new PaymentRepository();
  const expenseRepo = new ExpenseRepository();
  const payrollRepo = new PayrollRepository();
  const ledgerRepo = new LedgerRepository();

  const { data: shiftData, isLoading } = useQuery({
    queryKey: ['shift-settlement-data', shiftId],
    queryFn: async () => {
      if (!shiftId) return null;

      const shift = await shiftRepo.getShiftById(shiftId);
      if (!shift) throw new Error('Shift not found');

      const existingSettlement = await settlementRepo.findByShiftId(shiftId);

      const sales = (await saleRepo.findAll()).filter((sale) => sale.shift_id === shiftId);
      const payments = await Promise.all(sales.map((sale) => paymentRepo.findBySaleId(sale.id)));
      const flatPayments = payments.flat();
      const expenses = await expenseRepo.getApprovedExpensesForShift(shiftId);
      const payrollRule = await payrollRepo.findActiveByWorkerId(shift.worker_id);
      const ledgerData = await ledgerRepo.getAdvancesAndDeductionsForShift(shiftId);

      const totalSalesCents = sales.reduce((sum, sale) => sum + sale.total_cents, 0);
      const cashSalesCents = flatPayments
        .filter((p) => p.method === 'CASH')
        .reduce((sum, p) => sum + p.amount_cents, 0);
      const nonCashSalesCents = totalSalesCents - cashSalesCents;
      const approvedExpensesCashDrawerCents = expenses
        .filter((e) => e.paid_from === 'CASH_DRAWER')
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

      const settlementDay = SettlementService.getSettlementDay(shift);
      const dailyNetSalesCents = await SettlementService.computeDailyNetSales(
        shift.cart_id,
        settlementDay
      );
      const { managerShareCents, ownerShareCents } = SettlementService.computeNetSalesSplit(
        dailyNetSalesCents
      );

      const paymentsByMethod = {
        CASH: flatPayments.filter((p) => p.method === 'CASH').reduce((sum, p) => sum + p.amount_cents, 0),
        GCASH: flatPayments.filter((p) => p.method === 'GCASH').reduce((sum, p) => sum + p.amount_cents, 0),
        CARD: flatPayments.filter((p) => p.method === 'CARD').reduce((sum, p) => sum + p.amount_cents, 0),
        OTHER: flatPayments.filter((p) => p.method === 'OTHER').reduce((sum, p) => sum + p.amount_cents, 0),
      };

      return {
        shift,
        sales,
        expenses,
        computation,
        existingSettlement,
        settlementDay,
        dailyNetSalesCents,
        managerShareCents,
        ownerShareCents,
        paymentsByMethod,
      };
    },
    enabled: !!shiftId && !!isBoss,
  });

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!user || !shiftData) throw new Error('Missing data');
      if (!cashCounted || isNaN(parseFloat(cashCounted))) {
        throw new Error('Please enter a valid cash amount');
      }

      const cashCountedCents = Math.round(parseFloat(cashCounted) * 100);
      const cashDifferenceCents = SettlementService.computeCashDifference(
        shiftData.computation.cash_expected_cents,
        cashCountedCents
      );

      if (shiftData.existingSettlement) {
        throw new Error('Settlement already exists for this shift');
      }

      const settlement = await settlementRepo.create(
        shiftId!,
        shiftData.shift.cart_id,
        shiftData.shift.worker_id,
        user.id,
        shiftData.computation.cash_expected_cents,
        cashCountedCents,
        cashDifferenceCents,
        shiftData.computation.net_due_to_worker_cents,
        shiftData.computation.net_due_to_boss_cents,
        JSON.stringify(shiftData.computation),
        shiftData.settlementDay,
        shiftData.dailyNetSalesCents,
        shiftData.managerShareCents,
        shiftData.ownerShareCents,
        notes
      );

      return settlement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-settlement-data'] });
      queryClient.invalidateQueries({ queryKey: ['unsettled-shifts'] });
      Alert.alert('Success', 'Settlement draft saved', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to save settlement');
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!user || !shiftData) throw new Error('Missing data');
      if (!cashCounted || isNaN(parseFloat(cashCounted))) {
        throw new Error('Please enter a valid cash amount');
      }

      const cashCountedCents = Math.round(parseFloat(cashCounted) * 100);
      const cashDifferenceCents = SettlementService.computeCashDifference(
        shiftData.computation.cash_expected_cents,
        cashCountedCents
      );

      let settlementId: string;

      if (shiftData.existingSettlement) {
        if (shiftData.existingSettlement.status === 'FINALIZED') {
          throw new Error('Settlement already finalized');
        }
        settlementId = shiftData.existingSettlement.id;
      } else {
        const settlement = await settlementRepo.create(
          shiftId!,
          shiftData.shift.cart_id,
          shiftData.shift.worker_id,
          user.id,
          shiftData.computation.cash_expected_cents,
          cashCountedCents,
          cashDifferenceCents,
          shiftData.computation.net_due_to_worker_cents,
          shiftData.computation.net_due_to_boss_cents,
          JSON.stringify(shiftData.computation),
          shiftData.settlementDay,
          shiftData.dailyNetSalesCents,
          shiftData.managerShareCents,
          shiftData.ownerShareCents,
          notes
        );
        settlementId = settlement.id;
      }

      await settlementRepo.finalize(settlementId, user.id);

      await ledgerRepo.create(
        shiftData.shift.worker_id,
        'WAGE',
        shiftData.computation.base_wage_cents,
        user.id,
        shiftId!,
        'Base wage for shift'
      );

      if (shiftData.computation.commission_cents > 0) {
        await ledgerRepo.create(
          shiftData.shift.worker_id,
          'COMMISSION',
          shiftData.computation.commission_cents,
          user.id,
          shiftId!,
          'Sales commission'
        );
      }

      return settlementId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-settlement-data'] });
      queryClient.invalidateQueries({ queryKey: ['unsettled-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['recent-settlements'] });
      Alert.alert('Success', 'Settlement finalized', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to finalize settlement');
    },
  });

  const handleSaveDraft = () => {
    Alert.alert('Save Draft', 'Save settlement as draft?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: () => saveDraftMutation.mutate() },
    ]);
  };

  const handleFinalize = () => {
    Alert.alert(
      'Finalize Settlement',
      'Once finalized, this settlement cannot be edited. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Finalize', style: 'destructive', onPress: () => finalizeMutation.mutate() },
      ]
    );
  };

  if (!user || !isBoss) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Access Denied' }} />
        <Text style={[styles.errorText, { color: theme.error }]}>
          You don&apos;t have permission to access this page
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!shiftData) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Not Found' }} />
        <Text style={[styles.errorText, { color: theme.error }]}>Shift not found</Text>
      </View>
    );
  }

  const isFinalized = shiftData.existingSettlement?.status === 'FINALIZED';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: isFinalized ? 'Settlement (Finalized)' : 'Create Settlement',
          headerStyle: {
            backgroundColor: '#000',
          },
          headerTintColor: '#FFF',
          headerTitleStyle: {
            color: '#FFF',
          },
        }}
      />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Shift Information</Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Worker:</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {shiftData.shift.worker_id}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Cart:</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {shiftData.shift.cart_id}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Started:</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {format(shiftData.shift.clock_in, 'MMM d, yyyy • h:mm a')}
            </Text>
          </View>
          {shiftData.shift.clock_out && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Ended:</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {format(shiftData.shift.clock_out, 'MMM d, yyyy • h:mm a')}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Sales Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Total Sales:</Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>
              ₱{(shiftData.computation.total_sales_cents / 100).toFixed(2)}
            </Text>
          </View>
          <View style={styles.paymentBreakdown}>
            <Text style={[styles.breakdownTitle, { color: theme.textSecondary }]}>
              By Payment Method:
            </Text>
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>Cash:</Text>
              <Text style={[styles.breakdownValue, { color: theme.text }]}>
                ₱{(shiftData.paymentsByMethod.CASH / 100).toFixed(2)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>GCash:</Text>
              <Text style={[styles.breakdownValue, { color: theme.text }]}>
                ₱{(shiftData.paymentsByMethod.GCASH / 100).toFixed(2)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>Card:</Text>
              <Text style={[styles.breakdownValue, { color: theme.text }]}>
                ₱{(shiftData.paymentsByMethod.CARD / 100).toFixed(2)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>Other:</Text>
              <Text style={[styles.breakdownValue, { color: theme.text }]}>
                ₱{(shiftData.paymentsByMethod.OTHER / 100).toFixed(2)}
              </Text>
            </View>
          </View>
          {shiftData.expenses.length > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                  Approved Expenses:
                </Text>
                <Text style={[styles.summaryValue, { color: theme.text }]}>
                  ₱
                  {(shiftData.computation.approved_expenses_cash_drawer_cents / 100).toFixed(2)}
                </Text>
              </View>
            </>
          )}
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.text, fontWeight: '600' }]}>
              Expected Cash:
            </Text>
            <Text
              style={[styles.summaryValue, { color: theme.text, fontWeight: '600', fontSize: 18 }]}
            >
              ₱{(shiftData.computation.cash_expected_cents / 100).toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.primary, borderWidth: 2 }]}>
          <View style={styles.splitHeader}>
            <TrendingUp size={24} color={theme.primary} />
            <Text style={[styles.cardTitle, { color: theme.text, marginLeft: 8 }]}>
              Daily Net Sales Split
            </Text>
          </View>
          <Text style={[styles.splitSubtitle, { color: theme.textSecondary }]}>
            Cart: {shiftData.shift.cart_id} • Day: {shiftData.settlementDay}
          </Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.text, fontWeight: '600' }]}>
              Daily Net Sales:
            </Text>
            <Text
              style={[styles.summaryValue, { color: theme.primary, fontWeight: '600', fontSize: 18 }]}
            >
              ₱{(shiftData.dailyNetSalesCents / 100).toFixed(2)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
              Operation Manager (70%):
            </Text>
            <Text style={[styles.summaryValue, { color: theme.success, fontWeight: '600' }]}>
              ₱{(shiftData.managerShareCents / 100).toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
              Owner (30%):
            </Text>
            <Text style={[styles.summaryValue, { color: theme.text, fontWeight: '600' }]}>
              ₱{(shiftData.ownerShareCents / 100).toFixed(2)}
            </Text>
          </View>
          <Text style={[styles.noteText, { color: theme.textSecondary }]}>
            * The manager who finalizes this settlement will be credited the Operation Manager share.
          </Text>
        </View>

        {!isFinalized ? (
          <>
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Cash Count</Text>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Cash Counted (₱)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
                value={cashCounted}
                onChangeText={setCashCounted}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
                editable={!isFinalized}
              />
              {cashCounted && !isNaN(parseFloat(cashCounted)) && (
                <View style={styles.differenceCard}>
                  <Text style={[styles.differenceLabel, { color: theme.textSecondary }]}>
                    Cash Difference:
                  </Text>
                  <Text
                    style={[
                      styles.differenceValue,
                      {
                        color:
                          Math.round(parseFloat(cashCounted) * 100) -
                            shiftData.computation.cash_expected_cents >
                          0
                            ? theme.success
                            : Math.round(parseFloat(cashCounted) * 100) -
                                shiftData.computation.cash_expected_cents <
                              0
                            ? theme.error
                            : theme.text,
                      },
                    ]}
                  >
                    {Math.round(parseFloat(cashCounted) * 100) -
                      shiftData.computation.cash_expected_cents >
                    0
                      ? '+'
                      : ''}
                    ₱
                    {(
                      (Math.round(parseFloat(cashCounted) * 100) -
                        shiftData.computation.cash_expected_cents) /
                      100
                    ).toFixed(2)}
                  </Text>
                </View>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Notes (Optional)</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: theme.background, color: theme.text }]}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                placeholder="Add any notes about this settlement..."
                placeholderTextColor={theme.textSecondary}
                editable={!isFinalized}
              />
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.draftButton, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}
                onPress={handleSaveDraft}
                disabled={saveDraftMutation.isPending || finalizeMutation.isPending}
              >
                {saveDraftMutation.isPending ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : (
                  <Text style={[styles.buttonText, { color: theme.text }]}>Save Draft</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.finalizeButton, { backgroundColor: theme.primary }]}
                onPress={handleFinalize}
                disabled={saveDraftMutation.isPending || finalizeMutation.isPending}
              >
                {finalizeMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <CheckCircle size={20} color="#fff" />
                    <Text style={[styles.buttonText, { color: '#fff', marginLeft: 8 }]}>
                      Finalize Settlement
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={[styles.finalizedBanner, { backgroundColor: theme.success + '20' }]}>
            <Lock size={24} color={theme.success} />
            <Text style={[styles.finalizedText, { color: theme.success }]}>
              Settlement Finalized
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
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
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  paymentBreakdown: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  breakdownTitle: {
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingLeft: 8,
  },
  breakdownLabel: {
    fontSize: 13,
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 12,
  },
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  splitSubtitle: {
    fontSize: 12,
    marginBottom: 12,
  },
  noteText: {
    fontSize: 11,
    marginTop: 8,
    fontStyle: 'italic',
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
    minHeight: 100,
    textAlignVertical: 'top',
  },
  differenceCard: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  differenceLabel: {
    fontSize: 14,
  },
  differenceValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  actions: {
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  draftButton: {},
  finalizeButton: {},
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  finalizedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  finalizedText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
