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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { CheckCircle, Lock } from 'lucide-react-native';
import { format } from 'date-fns';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { SettlementRepository } from '@/lib/repositories/settlement.repository';
import { ShiftRepository, SaleRepository, PaymentRepository, SavedRecordRepository, CartRepository } from '@/lib/repositories';
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

  const [notes, setNotes] = useState('');

  const settlementRepo = new SettlementRepository();
  const shiftRepo = new ShiftRepository();
  const saleRepo = new SaleRepository();
  const paymentRepo = new PaymentRepository();
  const expenseRepo = new ExpenseRepository();
  const payrollRepo = new PayrollRepository();
  const ledgerRepo = new LedgerRepository();
  const savedRecordRepo = new SavedRecordRepository();
  const cartRepo = new CartRepository();

  const { data: shiftData, isLoading } = useQuery({
    queryKey: ['shift-settlement-data', shiftId],
    queryFn: async () => {
      if (!shiftId) return null;

      const shift = await shiftRepo.getShiftById(shiftId);
      if (!shift) throw new Error('Shift not found');

      const userRepo = new (await import('@/lib/repositories')).UserRepository();
      const workerUser = await userRepo.findById(shift.worker_id);
      const workerName = workerUser?.name || 'Operation Manager';

      const cart = await cartRepo.findById(shift.cart_id);
      const cartName = cart?.name || 'Unknown Cart';

      const existingSettlement = await settlementRepo.findByShiftId(shiftId);

      const sales = (await saleRepo.findAll()).filter((sale) => sale.shift_id === shiftId);
      const saleItems = await Promise.all(
        sales.map(async (sale) => {
          const items = await (async () => {
            const db = await (await import('@/lib/database/init')).getDatabase();
            return await db.getAllAsync<any>(
              `SELECT si.*, p.name as product_name 
               FROM sale_items si 
               LEFT JOIN products p ON si.product_id = p.id 
               WHERE si.sale_id = ?`,
              [sale.id]
            );
          })();
          return items;
        })
      );
      const flatSaleItems = saleItems.flat();

      const productsSold = flatSaleItems.reduce((acc: any[], item: any) => {
        const existing = acc.find((p) => p.product_id === item.product_id);
        if (existing) {
          existing.quantity += item.quantity;
          existing.total_cents += item.line_total_cents;
        } else {
          acc.push({
            product_id: item.product_id,
            product_name: item.product_name || 'Unknown Product',
            quantity: item.quantity,
            total_cents: item.line_total_cents,
          });
        }
        return acc;
      }, []);

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
        productsSold,
        workerName,
        cartName,
      };
    },
    enabled: !!shiftId && !!isBoss,
  });

  const saveSettlementMutation = useMutation({
    mutationFn: async () => {
      if (!user || !shiftData) throw new Error('Missing data');

      const payload = {
        cart_name: shiftData.cartName,
        seller_name: shiftData.workerName,
        date: format(shiftData.shift.clock_out || shiftData.shift.clock_in, 'MM-dd-yyyy'),
        products_sold: shiftData.productsSold.map((p: any) => ({
          name: p.product_name,
          qty: p.quantity,
          price: (p.total_cents / 100).toFixed(2),
        })),
        sales_summary: {
          cash: (shiftData.paymentsByMethod.CASH / 100).toFixed(2),
          gcash: (shiftData.paymentsByMethod.GCASH / 100).toFixed(2),
          card: (shiftData.paymentsByMethod.CARD / 100).toFixed(2),
          total: (shiftData.computation.total_sales_cents / 100).toFixed(2),
        },
        notes: notes || null,
      };

      await savedRecordRepo.saveSnapshot('settlement', shiftId!, payload, user.id, notes || undefined);

      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-settlement-data'] });
      queryClient.invalidateQueries({ queryKey: ['unsettled-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['saved-records'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-analytics'] });
      Alert.alert('Success', 'Settlement saved');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to save settlement');
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!user || !shiftData) throw new Error('Missing data');

      const cashCountedCents = 0;
      const cashDifferenceCents = 0;

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

  const handleSaveSettlement = () => {
    if (shiftData?.existingSettlement) {
      Alert.alert('Already Saved', 'Settlement already saved for this shift');
      return;
    }

    Alert.alert('Save Settlement', 'Save this settlement?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: () => saveSettlementMutation.mutate() },
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
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={100}
      >
        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContentContainer}
        >
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Shift Information</Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Seller:</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {shiftData.workerName}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Cart:</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {shiftData.cartName}
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
              Total:
            </Text>
            <Text
              style={[styles.summaryValue, { color: theme.text, fontWeight: '600', fontSize: 18 }]}
            >
              ₱{(shiftData.computation.total_sales_cents / 100).toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Products Sold</Text>
          {shiftData.productsSold && shiftData.productsSold.length > 0 ? (
            shiftData.productsSold.map((product: any, index: number) => (
              <View key={index} style={styles.productRow}>
                <View style={styles.productLeft}>
                  <Text style={[styles.productName, { color: theme.text }]}>{product.product_name}</Text>
                  <Text style={[styles.productQty, { color: theme.textSecondary }]}>Qty: {product.quantity}</Text>
                </View>
                <Text style={[styles.productTotal, { color: theme.text }]}>
                  ₱{(product.total_cents / 100).toFixed(2)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyProductsText, { color: theme.textSecondary }]}>No products sold in this shift</Text>
          )}
        </View>



        {!isFinalized ? (
          <>
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
                style={[styles.button, styles.saveButton, { backgroundColor: theme.success }]}
                onPress={handleSaveSettlement}
                disabled={saveSettlementMutation.isPending || finalizeMutation.isPending}
              >
                {saveSettlementMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={[styles.buttonText, { color: '#FFF' }]}>Save Settlement</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.finalizeButton, { backgroundColor: theme.primary }]}
                onPress={handleFinalize}
                disabled={saveSettlementMutation.isPending || finalizeMutation.isPending}
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
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContentContainer: {
    padding: 16,
    paddingBottom: 200,
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
    minHeight: 120,
    maxHeight: 200,
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
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  productLeft: {
    flex: 1,
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  productQty: {
    fontSize: 13,
  },
  productTotal: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyProductsText: {
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 12,
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
  saveButton: {},
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
