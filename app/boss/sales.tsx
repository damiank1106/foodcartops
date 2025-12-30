import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Filter, X, User, ShoppingBag } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { SaleRepository, UserRepository, CartRepository } from '@/lib/repositories';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { useRouter } from 'expo-router';
import { PaymentMethod } from '@/lib/types';

export default function BossSalesScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'all'>('today');
  const [selectedWorker, setSelectedWorker] = useState<string>('');
  const [selectedCart, setSelectedCart] = useState<string>('');
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | ''>('');

  const saleRepo = new SaleRepository();
  const userRepo = new UserRepository();
  const cartRepo = new CartRepository();

  const { data: workers } = useQuery({
    queryKey: ['workers'],
    queryFn: () => userRepo.findByRole('operation_manager'),
  });

  const { data: carts } = useQuery({
    queryKey: ['carts'],
    queryFn: () => cartRepo.findAll(),
  });

  const { data: sales, isLoading } = useQuery({
    queryKey: ['sales', dateRange, selectedWorker, selectedCart, selectedPayment],
    queryFn: async () => {
      const today = new Date();
      let start_date: Date | undefined;
      let end_date: Date | undefined;

      if (dateRange === 'today') {
        start_date = startOfDay(today);
        end_date = endOfDay(today);
      } else if (dateRange === 'week') {
        start_date = startOfDay(subDays(today, 7));
        end_date = endOfDay(today);
      }

      const allSales = await saleRepo.findAll({
        start_date,
        end_date,
        worker_id: selectedWorker || undefined,
        cart_id: selectedCart || undefined,
      });

      if (selectedPayment) {
        return allSales.filter(sale =>
          sale.payments.some(p => p.method === selectedPayment)
        );
      }

      return allSales;
    },
    refetchInterval: 30000,
  });

  const clearFilters = () => {
    setDateRange('today');
    setSelectedWorker('');
    setSelectedCart('');
    setSelectedPayment('');
  };

  const hasActiveFilters = selectedWorker || selectedCart || selectedPayment || dateRange !== 'today';

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const totalRevenue = sales?.reduce((sum, sale) => sum + sale.total_amount, 0) || 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Sales</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {sales?.length || 0} transactions
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.filterButton,
              { backgroundColor: hasActiveFilters ? theme.primary : theme.card },
            ]}
            onPress={() => setShowFilters(true)}
          >
            <Filter size={20} color={hasActiveFilters ? '#FFF' : theme.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.revenueCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.revenueLabel, { color: theme.textSecondary }]}>Total Revenue</Text>
          <Text style={[styles.revenueValue, { color: theme.primary }]}>
            ₱{totalRevenue.toFixed(2)}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {sales?.map((sale) => (
          <TouchableOpacity
            key={sale.id}
            style={[styles.saleCard, { backgroundColor: theme.card }]}
            onPress={() => router.push(`/boss/sales/${sale.id}` as any)}
          >
            <View style={styles.saleHeader}>
              <View style={styles.saleInfo}>
                <Text style={[styles.saleId, { color: theme.text }]}>
                  #{sale.id.slice(0, 8)}
                </Text>
                <Text style={[styles.saleTime, { color: theme.textSecondary }]}>
                  {format(new Date(sale.created_at), 'MMM d, h:mm a')}
                </Text>
              </View>
              <Text style={[styles.saleAmount, { color: theme.primary }]}>
                ₱{sale.total_amount.toFixed(2)}
              </Text>
            </View>

            <View style={styles.saleDetails}>
              <View style={styles.saleDetailItem}>
                <User size={14} color={theme.textSecondary} />
                <Text style={[styles.saleDetailText, { color: theme.textSecondary }]}>
                  {sale.worker_name}
                </Text>
              </View>
              <View style={styles.saleDetailItem}>
                <ShoppingBag size={14} color={theme.textSecondary} />
                <Text style={[styles.saleDetailText, { color: theme.textSecondary }]}>
                  {sale.cart_name}
                </Text>
              </View>
            </View>

            <View style={styles.paymentMethods}>
              {sale.payments.map((payment, idx) => (
                <View
                  key={idx}
                  style={[styles.paymentBadge, { backgroundColor: theme.background }]}
                >
                  <Text style={[styles.paymentText, { color: theme.text }]}>
                    {payment.method}
                  </Text>
                </View>
              ))}
            </View>

            {sale.voided_at && (
              <View style={[styles.voidedBadge, { backgroundColor: theme.error + '20' }]}>
                <Text style={[styles.voidedText, { color: theme.error }]}>VOIDED</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        {sales?.length === 0 && (
          <View style={styles.emptyState}>
            <ShoppingBag size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Sales Found</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Try adjusting your filters
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showFilters}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <X size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.filterLabel, { color: theme.text }]}>Date Range</Text>
            <View style={styles.filterButtons}>
              {(['today', 'week', 'all'] as const).map((range) => (
                <TouchableOpacity
                  key={range}
                  style={[
                    styles.filterOptionButton,
                    { borderColor: theme.border },
                    dateRange === range && { backgroundColor: theme.primary },
                  ]}
                  onPress={() => setDateRange(range)}
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      { color: theme.text },
                      dateRange === range && { color: '#FFF' },
                    ]}
                  >
                    {range === 'today' ? 'Today' : range === 'week' ? 'Last 7 Days' : 'All Time'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.filterLabel, { color: theme.text }]}>Worker</Text>
            <ScrollView style={styles.filterScroll} horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[
                  styles.filterOptionButton,
                  { borderColor: theme.border },
                  !selectedWorker && { backgroundColor: theme.primary },
                ]}
                onPress={() => setSelectedWorker('')}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    { color: theme.text },
                    !selectedWorker && { color: '#FFF' },
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {workers?.map((worker: any) => (
                <TouchableOpacity
                  key={worker.id}
                  style={[
                    styles.filterOptionButton,
                    { borderColor: theme.border },
                    selectedWorker === worker.id && { backgroundColor: theme.primary },
                  ]}
                  onPress={() => setSelectedWorker(worker.id)}
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      { color: theme.text },
                      selectedWorker === worker.id && { color: '#FFF' },
                    ]}
                  >
                    {worker.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.filterLabel, { color: theme.text }]}>Cart</Text>
            <ScrollView style={styles.filterScroll} horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[
                  styles.filterOptionButton,
                  { borderColor: theme.border },
                  !selectedCart && { backgroundColor: theme.primary },
                ]}
                onPress={() => setSelectedCart('')}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    { color: theme.text },
                    !selectedCart && { color: '#FFF' },
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {carts?.map((cart) => (
                <TouchableOpacity
                  key={cart.id}
                  style={[
                    styles.filterOptionButton,
                    { borderColor: theme.border },
                    selectedCart === cart.id && { backgroundColor: theme.primary },
                  ]}
                  onPress={() => setSelectedCart(cart.id)}
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      { color: theme.text },
                      selectedCart === cart.id && { color: '#FFF' },
                    ]}
                  >
                    {cart.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.filterLabel, { color: theme.text }]}>Payment Method</Text>
            <View style={styles.filterButtons}>
              <TouchableOpacity
                style={[
                  styles.filterOptionButton,
                  { borderColor: theme.border },
                  !selectedPayment && { backgroundColor: theme.primary },
                ]}
                onPress={() => setSelectedPayment('')}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    { color: theme.text },
                    !selectedPayment && { color: '#FFF' },
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {(['CASH', 'CARD', 'GCASH', 'OTHER'] as PaymentMethod[]).map((method) => (
                <TouchableOpacity
                  key={method}
                  style={[
                    styles.filterOptionButton,
                    { borderColor: theme.border },
                    selectedPayment === method && { backgroundColor: theme.primary },
                  ]}
                  onPress={() => setSelectedPayment(method)}
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      { color: theme.text },
                      selectedPayment === method && { color: '#FFF' },
                    ]}
                  >
                    {method}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.clearButton, { backgroundColor: theme.background }]}
                onPress={clearFilters}
              >
                <Text style={[styles.clearButtonText, { color: theme.text }]}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.applyButton, { backgroundColor: theme.primary }]}
                onPress={() => setShowFilters(false)}
              >
                <Text style={styles.applyButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  revenueCard: {
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  revenueLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  revenueValue: {
    fontSize: 28,
    fontWeight: '700' as const,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  saleCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  saleInfo: {
    flex: 1,
  },
  saleId: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  saleTime: {
    fontSize: 12,
  },
  saleAmount: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  saleDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  saleDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saleDetailText: {
    fontSize: 12,
  },
  paymentMethods: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  paymentText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  voidedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  voidedText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
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
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginTop: 16,
    marginBottom: 12,
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterScroll: {
    marginBottom: 8,
  },
  filterOptionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    marginRight: 8,
  },
  filterOptionText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  clearButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  applyButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
