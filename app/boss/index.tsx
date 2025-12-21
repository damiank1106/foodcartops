import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Coins, Users, ShoppingBag } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { SaleRepository, ShiftRepository, CartRepository } from '@/lib/repositories';
import { startOfDay, endOfDay, format } from 'date-fns';

export default function BossDashboard() {
  const { theme } = useTheme();
  const saleRepo = new SaleRepository();
  const shiftRepo = new ShiftRepository();
  const cartRepo = new CartRepository();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const today = new Date();
      const startOfToday = startOfDay(today);
      const endOfToday = endOfDay(today);

      const todaySales = await saleRepo.findAll({
        start_date: startOfToday,
        end_date: endOfToday,
      });

      const todayRevenue = todaySales.reduce((sum, sale) => sum + sale.total_amount, 0);
      const activeWorkerCount = await shiftRepo.getActiveWorkerCount();
      const carts = await cartRepo.findAll();

      const revenueByCart = carts.map((cart) => {
        const cartSales = todaySales.filter((sale) => sale.cart_id === cart.id);
        const revenue = cartSales.reduce((sum, sale) => sum + sale.total_amount, 0);
        return { cart_name: cart.name, revenue };
      });

      const revenueByPayment = (['CASH', 'CARD', 'GCASH', 'OTHER'] as const).map((method) => {
        const revenue = todaySales.reduce((sum, sale) => {
          const paymentTotal = sale.payments
            .filter(p => p.method === method)
            .reduce((s, p) => s + p.amount_cents, 0);
          return sum + paymentTotal / 100;
        }, 0);
        return { payment_method: method, revenue };
      });

      return {
        today_sales: todaySales.length,
        today_revenue: todayRevenue,
        active_workers: activeWorkerCount,
        revenue_by_cart: revenueByCart,
        revenue_by_payment: revenueByPayment,
      };
    },
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.date, { color: theme.textSecondary }]}>
            {format(new Date(), 'EEEE, MMMM d')}
          </Text>
          <Text style={[styles.greeting, { color: theme.text }]}>Today&apos;s Overview</Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: theme.card }]}>
            <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
              <Coins size={24} color={theme.primary} />
            </View>
            <Text style={[styles.statValue, { color: theme.text }]}>
              ₱{stats?.today_revenue.toFixed(2)}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Today&apos;s Revenue</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: theme.card }]}>
            <View style={[styles.iconContainer, { backgroundColor: theme.success + '20' }]}>
              <ShoppingBag size={24} color={theme.success} />
            </View>
            <Text style={[styles.statValue, { color: theme.text }]}>{stats?.today_sales}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Sales</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: theme.card }]}>
            <View style={[styles.iconContainer, { backgroundColor: theme.warning + '20' }]}>
              <Users size={24} color={theme.warning} />
            </View>
            <Text style={[styles.statValue, { color: theme.text }]}>{stats?.active_workers}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Active Workers</Text>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Revenue by Cart</Text>
          {stats?.revenue_by_cart.map((item, index) => (
            <View key={index} style={styles.listItem}>
              <Text style={[styles.listItemLabel, { color: theme.text }]}>{item.cart_name}</Text>
              <Text style={[styles.listItemValue, { color: theme.primary }]}>
                ₱{item.revenue.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Revenue by Payment</Text>
          {stats?.revenue_by_payment.map((item, index) => (
            <View key={index} style={styles.listItem}>
              <Text style={[styles.listItemLabel, { color: theme.text }]}>
                {item.payment_method}
              </Text>
              <Text style={[styles.listItemValue, { color: theme.primary }]}>
                ₱{item.revenue.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  date: {
    fontSize: 14,
    marginBottom: 4,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700' as const,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  section: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    marginBottom: 16,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  listItemLabel: {
    fontSize: 16,
  },
  listItemValue: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
