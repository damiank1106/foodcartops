import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Coins, Users, ShoppingBag, AlertTriangle, TrendingDown, Clock, XCircle, Bookmark, Trash2, Edit2, Save, X, Plus, CheckCircle, Database } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { SaleRepository, ShiftRepository, CartRepository, ExpenseRepository, AuditRepository } from '@/lib/repositories';
import DatabaseScreen from './database';
import { SettlementRepository } from '@/lib/repositories/settlement.repository';
import { BossSavedItemsRepository } from '@/lib/repositories/boss-saved-items.repository';
import { SavedRecordRepository } from '@/lib/repositories/saved-record.repository';
import { startOfDay, endOfDay, format } from 'date-fns';

export default function BossDashboard() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<'overview' | 'settlements' | 'activity' | 'saved' | 'carts' | 'database'>('overview');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [editingCart, setEditingCart] = useState<any>(null);
  const [cartName, setCartName] = useState('');
  const [cartLocation, setCartLocation] = useState('');
  const [cartNotes, setCartNotes] = useState('');
  const [settlementDetailModalVisible, setSettlementDetailModalVisible] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<any>(null);
  const [showInactive, setShowInactive] = useState(false);
  
  const saleRepo = new SaleRepository();
  const shiftRepo = new ShiftRepository();
  const cartRepo = new CartRepository();
  const expenseRepo = new ExpenseRepository();
  const settlementRepo = new SettlementRepository();
  const auditRepo = new AuditRepository();
  const savedItemsRepo = new BossSavedItemsRepository();
  const savedRecordRepo = new SavedRecordRepository();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['boss-monitoring-stats'],
    queryFn: async () => {
      const today = new Date();
      const startOfToday = startOfDay(today);
      const endOfToday = endOfDay(today);

      const todaySales = await saleRepo.findAll({
        start_date: startOfToday,
        end_date: endOfToday,
      });

      const todayRevenueCents = todaySales.reduce((sum, sale) => sum + sale.total_cents, 0);
      const activeWorkerCount = await shiftRepo.getActiveWorkerCount();
      
      const todayExpenses = (await expenseRepo.findAll()).filter(
        e => e.created_at >= startOfToday.getTime() && e.created_at <= endOfToday.getTime() && e.status === 'APPROVED'
      );
      const todayExpensesCents = todayExpenses.reduce((sum, e) => sum + e.amount_cents, 0);

      const estimatedProfitCents = todayRevenueCents - todayExpensesCents;

      const unsettledShifts = await settlementRepo.getUnsettledShifts();
      const cashDifferences = await settlementRepo.getCashDifferences();
      const cashDifferencesSumCents = cashDifferences.reduce((sum, d) => sum + d.cash_difference_cents, 0);

      const pendingExpensesCount = await expenseRepo.getPendingCount();
      
      const voidedSalesCount = todaySales.filter(s => s.voided_at).length;

      const carts = await cartRepo.findAll();
      const revenueByCart = carts.map((cart) => {
        const cartSales = todaySales.filter((sale) => sale.cart_id === cart.id);
        const revenue = cartSales.reduce((sum, sale) => sum + sale.total_cents, 0);
        return { cart_name: cart.name, revenue_cents: revenue };
      });

      const revenueByPayment = (['CASH', 'CARD', 'GCASH', 'OTHER'] as const).map((method) => {
        const revenue = todaySales.reduce((sum, sale) => {
          const paymentTotal = sale.payments
            .filter(p => p.method === method)
            .reduce((s, p) => s + p.amount_cents, 0);
          return sum + paymentTotal;
        }, 0);
        return { payment_method: method, revenue_cents: revenue };
      });

      return {
        today_sales: todaySales.length,
        today_revenue_cents: todayRevenueCents,
        today_expenses_cents: todayExpensesCents,
        estimated_profit_cents: estimatedProfitCents,
        active_workers: activeWorkerCount,
        unsettled_shifts_count: unsettledShifts.length,
        cash_differences_sum_cents: cashDifferencesSumCents,
        pending_expenses_count: pendingExpensesCount,
        voided_sales_count: voidedSalesCount,
        revenue_by_cart: revenueByCart,
        revenue_by_payment: revenueByPayment,
        unsettled_shifts: unsettledShifts,
        cash_differences: cashDifferences,
      };
    },
    refetchInterval: 10000,
  });

  const { data: recentActivity } = useQuery({
    queryKey: ['boss-activity-feed'],
    queryFn: async () => {
      const logs = await auditRepo.getRecentLogs(50);
      return logs;
    },
    refetchInterval: 30000,
  });

  const handleDeleteActivity = (logId: string) => {
    Alert.alert(
      'Remove Activity',
      'Remove this activity from the list?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            await auditRepo.softDeleteLog(logId, user.id);
            queryClient.invalidateQueries({ queryKey: ['boss-activity-feed'] });
          },
        },
      ]
    );
  };

  const handleClearAllActivity = () => {
    Alert.alert(
      'Clear All Activity',
      'Remove all activity items from the list? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            await auditRepo.clearAllLogs(user.id);
            queryClient.invalidateQueries({ queryKey: ['boss-activity-feed'] });
          },
        },
      ]
    );
  };

  const { data: savedItems } = useQuery({
    queryKey: ['saved-items', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return savedItemsRepo.findAll({ created_by_user_id: user.id });
    },
    enabled: !!user?.id,
    refetchInterval: 10000,
  });

  const { data: savedRecords } = useQuery({
    queryKey: ['saved-records', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return savedRecordRepo.listAll();
    },
    enabled: !!user?.id,
    refetchInterval: 10000,
  });

  const { data: allCarts } = useQuery({
    queryKey: ['all-carts', showInactive],
    queryFn: async () => {
      if (showInactive) {
        return cartRepo.findAllIncludingInactive();
      }
      return cartRepo.findAll();
    },
    refetchInterval: 10000,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { type: any; title: string; notes?: string; linkedType?: string; linkedId?: string }) => {
      if (!user?.id) throw new Error('No user');
      return savedItemsRepo.create({
        type: data.type,
        title: data.title,
        notes: data.notes,
        severity: 'MEDIUM',
        status: 'OPEN',
        linked_entity_type: data.linkedType,
        linked_entity_id: data.linkedId,
        created_by_user_id: user.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-items'] });
      Alert.alert('Success', 'Exception saved for later review');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to save: ${error}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      if (!user?.id) throw new Error('No user');
      return savedItemsRepo.update(id, data, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-items'] });
      setEditModalVisible(false);
      Alert.alert('Success', 'Changes saved');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to update: ${error}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error('No user');
      return savedItemsRepo.delete(id, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-items'] });
      Alert.alert('Success', 'Item deleted');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to delete: ${error}`);
    },
  });

  const deleteRecordMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error('No user');
      return savedRecordRepo.softDelete(id, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-records'] });
      Alert.alert('Success', 'Settlement deleted');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to delete: ${error}`);
    },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      await shiftRepo.deleteShift(shiftId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boss-monitoring-stats'] });
      Alert.alert('Success', 'Unsettled shift deleted');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to delete shift: ${error}`);
    },
  });

  const deleteSettlementMutation = useMutation({
    mutationFn: async (settlementId: string) => {
      if (!user?.id) throw new Error('No user');
      await settlementRepo.delete(settlementId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boss-monitoring-stats'] });
      Alert.alert('Success', 'Cash difference settlement deleted');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to delete settlement: ${error}`);
    },
  });



  const handleSaveException = (type: any, title: string, notes?: string, linkedType?: string, linkedId?: string) => {
    Alert.alert(
      'Save Exception',
      'Save this exception for later review?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: () => saveMutation.mutate({ type, title, notes, linkedType, linkedId }),
        },
      ]
    );
  };

  const handleEditItem = (item: any) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditNotes(item.notes || '');
    setEditStatus(item.status);
    setEditModalVisible(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id,
      data: {
        title: editTitle,
        notes: editNotes,
        status: editStatus,
      },
    });
  };

  const handleDeleteItem = (id: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this saved item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(id),
        },
      ]
    );
  };

  const handleDeleteRecord = (id: string) => {
    Alert.alert(
      'Delete Settlement',
      'Are you sure you want to delete this settlement?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteRecordMutation.mutate(id),
        },
      ]
    );
  };

  const handleDeleteShift = (shiftId: string, workerName: string) => {
    Alert.alert(
      'Delete Unsettled Shift',
      `Are you sure you want to delete ${workerName}'s shift? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteShiftMutation.mutate(shiftId),
        },
      ]
    );
  };

  const handleDeleteSettlement = (settlementId: string, workerName: string) => {
    Alert.alert(
      'Delete Cash Difference',
      `Are you sure you want to delete ${workerName}'s settlement? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteSettlementMutation.mutate(settlementId),
        },
      ]
    );
  };

  const openCartModal = (cart?: any) => {
    if (cart) {
      setEditingCart(cart);
      setCartName(cart.name);
      setCartLocation(cart.location || '');
      setCartNotes(cart.notes || '');
    } else {
      setEditingCart(null);
      setCartName('');
      setCartLocation('');
      setCartNotes('');
    }
    setCartModalVisible(true);
  };

  const handleSaveCart = async () => {
    if (!cartName.trim()) {
      Alert.alert('Error', 'Cart name is required');
      return;
    }

    try {
      if (editingCart) {
        await cartRepo.update(
          editingCart.id,
          {
            name: cartName,
            location: cartLocation || undefined,
            notes: cartNotes || undefined,
          },
          user?.id
        );
      } else {
        await cartRepo.create(
          {
            name: cartName,
            location: cartLocation || undefined,
            notes: cartNotes || undefined,
          },
          user?.id
        );
      }
      queryClient.invalidateQueries({ queryKey: ['all-carts'] });
      queryClient.invalidateQueries({ queryKey: ['carts'] });
      setCartModalVisible(false);
      Alert.alert('Success', editingCart ? 'Cart updated' : 'Cart created');
    } catch (error) {
      Alert.alert('Error', `Failed to save cart: ${error}`);
    }
  };

  const handleDeleteCart = (cartId: string, cartName: string) => {
    Alert.alert(
      'Delete Cart',
      `Are you sure you want to delete "${cartName}"? It will be marked as inactive.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await cartRepo.delete(cartId, user?.id);
              queryClient.invalidateQueries({ queryKey: ['all-carts'] });
              queryClient.invalidateQueries({ queryKey: ['carts'] });
              Alert.alert('Success', 'Cart deleted');
            } catch (error) {
              Alert.alert('Error', `Failed to delete cart: ${error}`);
            }
          },
        },
      ]
    );
  };

  const handleRestoreCart = async (cartId: string, cartName: string) => {
    try {
      await cartRepo.restore(cartId, user?.id);
      queryClient.invalidateQueries({ queryKey: ['all-carts'] });
      queryClient.invalidateQueries({ queryKey: ['carts'] });
      Alert.alert('Success', `"${cartName}" restored`);
    } catch (error) {
      Alert.alert('Error', `Failed to restore cart: ${error}`);
    }
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
      <View style={[styles.tabsContainer, { borderBottomColor: theme.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScrollContent}>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => setSelectedTab('overview')}
          >
            <Text style={[styles.tabText, { color: selectedTab === 'overview' ? theme.primary : theme.textSecondary }]}>
              Overview
            </Text>
            {selectedTab === 'overview' && <View style={[styles.tabUnderline, { backgroundColor: theme.primary }]} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => setSelectedTab('carts')}
          >
            <Text style={[styles.tabText, { color: selectedTab === 'carts' ? theme.primary : theme.textSecondary }]}>
              Carts
            </Text>
            {selectedTab === 'carts' && <View style={[styles.tabUnderline, { backgroundColor: theme.primary }]} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => setSelectedTab('settlements')}
          >
            <Text style={[styles.tabText, { color: selectedTab === 'settlements' ? theme.primary : theme.textSecondary }]}>
              Settlements
            </Text>
            {(stats && (stats.unsettled_shifts_count > 0 || stats.pending_expenses_count > 0 || stats.cash_differences.length > 0)) && (
              <View style={[styles.badge, { backgroundColor: theme.error }]}>
                <Text style={styles.badgeText}>
                  {stats.unsettled_shifts_count + stats.pending_expenses_count + stats.cash_differences.length}
                </Text>
              </View>
            )}
            {selectedTab === 'settlements' && <View style={[styles.tabUnderline, { backgroundColor: theme.primary }]} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => setSelectedTab('saved')}
          >
            <Text style={[styles.tabText, { color: selectedTab === 'saved' ? theme.primary : theme.textSecondary }]}>
              Saved
            </Text>
            {(savedItems && savedItems.length > 0 || savedRecords && savedRecords.length > 0) && (
              <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                <Text style={styles.badgeText}>{(savedItems?.length || 0) + (savedRecords?.length || 0)}</Text>
              </View>
            )}
            {selectedTab === 'saved' && <View style={[styles.tabUnderline, { backgroundColor: theme.primary }]} />}
          </TouchableOpacity>
          {user?.role === 'developer' && (
            <>
              <TouchableOpacity
                style={styles.tab}
                onPress={() => setSelectedTab('activity')}
              >
                <Text style={[styles.tabText, { color: selectedTab === 'activity' ? theme.primary : theme.textSecondary }]}>
                  Activity
                </Text>
                {selectedTab === 'activity' && <View style={[styles.tabUnderline, { backgroundColor: theme.primary }]} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tab}
                onPress={() => setSelectedTab('database')}
              >
                <Database size={16} color={selectedTab === 'database' ? theme.primary : theme.textSecondary} />
                <Text style={[styles.tabText, { color: selectedTab === 'database' ? theme.primary : theme.textSecondary }]}>
                  Database
                </Text>
                {selectedTab === 'database' && <View style={[styles.tabUnderline, { backgroundColor: theme.primary }]} />}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          {selectedTab === 'overview' && (
            <>
              <View style={styles.header}>
                <Text style={[styles.date, { color: theme.textSecondary }]}>
                  {format(new Date(), 'EEEE, MMMM d')}
                </Text>
                <Text style={[styles.greeting, { color: theme.text }]}>Today&apos;s Overview</Text>
              </View>

              <View style={styles.statsRow}>
                <View style={[styles.statCard, { backgroundColor: theme.card }]}>
                  <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
                    <Coins size={24} color={theme.primary} />
                  </View>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    ₱{((stats?.today_revenue_cents || 0) / 100).toFixed(2)}
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Sales</Text>
                </View>

                <View style={[styles.statCard, { backgroundColor: theme.card }]}>
                  <View style={[styles.iconContainer, { backgroundColor: theme.error + '20' }]}>
                    <TrendingDown size={24} color={theme.error} />
                  </View>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    ₱{((stats?.today_expenses_cents || 0) / 100).toFixed(2)}
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Expenses</Text>
                </View>
              </View>

              <View style={[styles.profitCard, { backgroundColor: theme.card }]}>
                <Text style={[styles.profitLabel, { color: theme.textSecondary }]}>Estimated Profit</Text>
                <Text style={[styles.profitValue, { color: (stats?.estimated_profit_cents || 0) >= 0 ? theme.success : theme.error }]}>
                  ₱{((stats?.estimated_profit_cents || 0) / 100).toFixed(2)}
                </Text>
              </View>

              <View style={styles.statsRow}>
                <View style={[styles.statCard, { backgroundColor: theme.card }]}>
                  <View style={[styles.iconContainer, { backgroundColor: theme.success + '20' }]}>
                    <ShoppingBag size={24} color={theme.success} />
                  </View>
                  <Text style={[styles.statValue, { color: theme.text }]}>{stats?.today_sales}</Text>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Transactions</Text>
                </View>

                <View style={[styles.statCard, { backgroundColor: theme.card }]}>
                  <View style={[styles.iconContainer, { backgroundColor: theme.warning + '20' }]}>
                    <Users size={24} color={theme.warning} />
                  </View>
                  <Text style={[styles.statValue, { color: theme.text }]}>{stats?.active_workers}</Text>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Active</Text>
                </View>
              </View>

              <View style={[styles.section, { backgroundColor: theme.card }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Revenue by Cart</Text>
                {stats?.revenue_by_cart.map((item, index) => (
                  <View key={index} style={styles.listItem}>
                    <Text style={[styles.listItemLabel, { color: theme.text }]}>{item.cart_name}</Text>
                    <Text style={[styles.listItemValue, { color: theme.primary }]}>
                      ₱{(item.revenue_cents / 100).toFixed(2)}
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
                      ₱{(item.revenue_cents / 100).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {selectedTab === 'settlements' && (
            <>
              <Text style={[styles.pageTitle, { color: theme.text }]}>Settlements & Exceptions</Text>

              {stats && stats.unsettled_shifts_count > 0 && (
                <View style={[styles.exceptionCard, { backgroundColor: theme.card }]}>
                  <TouchableOpacity
                    style={styles.exceptionMainContent}
                    onPress={() => router.push('/boss/unsettled-shifts' as any)}
                  >
                    <View style={styles.exceptionHeader}>
                      <View style={[styles.exceptionIcon, { backgroundColor: theme.warning + '20' }]}>
                        <Clock size={20} color={theme.warning} />
                      </View>
                      <View style={styles.exceptionInfo}>
                        <Text style={[styles.exceptionTitle, { color: theme.text }]}>
                          Unsettled Shifts
                        </Text>
                        <Text style={[styles.exceptionCount, { color: theme.warning }]}>
                          {stats.unsettled_shifts_count} shift{stats.unsettled_shifts_count !== 1 ? 's' : ''} pending settlement
                        </Text>
                      </View>
                    </View>
                    {stats.unsettled_shifts.slice(0, 3).map((shift) => (
                      <View key={shift.shift_id} style={styles.exceptionDetailRow}>
                        <View style={styles.exceptionDetail}>
                          <Text style={[styles.exceptionDetailText, { color: theme.textSecondary }]}>
                            {shift.worker_name} at {shift.cart_name}
                          </Text>
                          <Text style={[styles.exceptionDetailTime, { color: theme.textSecondary }]}>
                            {format(shift.clock_out, 'MMM d, h:mm a')}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.deleteIconButton, { backgroundColor: theme.error + '15' }]}
                          onPress={() => handleDeleteShift(shift.shift_id, shift.worker_name)}
                        >
                          <X size={14} color={theme.error} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </TouchableOpacity>
                  <View style={styles.exceptionButtonRow}>
                    <TouchableOpacity
                      style={[styles.saveButton, { backgroundColor: theme.primary + '15' }]}
                      onPress={() => handleSaveException(
                        'EXCEPTION',
                        'Unsettled Shifts',
                        `${stats.unsettled_shifts_count} shift(s) pending settlement`,
                        'unsettled_shifts',
                        'all'
                      )}
                    >
                      <Bookmark size={16} color={theme.primary} />
                      <Text style={[styles.saveButtonText, { color: theme.primary }]}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {stats && stats.cash_differences.length > 0 && (
                <View style={[styles.exceptionCard, { backgroundColor: theme.card }]}>
                  <TouchableOpacity
                    style={styles.exceptionMainContent}
                    onPress={() => router.push('/boss/cash-differences' as any)}
                  >
                    <View style={styles.exceptionHeader}>
                      <View style={[styles.exceptionIcon, { backgroundColor: theme.error + '20' }]}>
                        <AlertTriangle size={20} color={theme.error} />
                      </View>
                      <View style={styles.exceptionInfo}>
                        <Text style={[styles.exceptionTitle, { color: theme.text }]}>
                          Cash Differences
                        </Text>
                        <Text style={[styles.exceptionCount, { color: theme.error }]}>
                          {stats.cash_differences.length} settlement{stats.cash_differences.length !== 1 ? 's' : ''} with discrepancies
                        </Text>
                      </View>
                    </View>
                    {stats.cash_differences.slice(0, 3).map((diff) => (
                      <View key={diff.settlement_id} style={styles.exceptionDetailRow}>
                        <View style={styles.exceptionDetail}>
                          <Text style={[styles.exceptionDetailText, { color: theme.textSecondary }]}>
                            {diff.worker_name}
                          </Text>
                          <Text style={[styles.exceptionDetailAmount, { color: diff.cash_difference_cents > 0 ? theme.success : theme.error }]}>
                            {diff.cash_difference_cents > 0 ? '+' : ''}₱{(diff.cash_difference_cents / 100).toFixed(2)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.deleteIconButton, { backgroundColor: theme.error + '15' }]}
                          onPress={() => handleDeleteSettlement(diff.settlement_id, diff.worker_name)}
                        >
                          <X size={14} color={theme.error} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </TouchableOpacity>
                  <View style={styles.exceptionButtonRow}>
                    <TouchableOpacity
                      style={[styles.saveButton, { backgroundColor: theme.primary + '15' }]}
                      onPress={() => handleSaveException(
                        'ALERT',
                        'Cash Differences',
                        `${stats.cash_differences.length} settlement(s) with discrepancies`,
                        'cash_differences',
                        'all'
                      )}
                    >
                      <Bookmark size={16} color={theme.primary} />
                      <Text style={[styles.saveButtonText, { color: theme.primary }]}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {stats && stats.pending_expenses_count > 0 && (
                <View style={[styles.exceptionCard, { backgroundColor: theme.card }]}>
                  <View style={styles.exceptionMainContent}>
                    <View style={styles.exceptionHeader}>
                      <View style={[styles.exceptionIcon, { backgroundColor: theme.primary + '20' }]}>
                        <ShoppingBag size={20} color={theme.primary} />
                      </View>
                      <View style={styles.exceptionInfo}>
                        <Text style={[styles.exceptionTitle, { color: theme.text }]}>
                          Pending Expenses
                        </Text>
                        <Text style={[styles.exceptionCount, { color: theme.primary }]}>
                          {stats.pending_expenses_count} expense{stats.pending_expenses_count !== 1 ? 's' : ''} awaiting approval
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.viewAllButton, { backgroundColor: theme.primary + '10' }]}
                      onPress={() => router.push('/boss/pending-expenses' as any)}
                    >
                      <Text style={[styles.viewAllText, { color: theme.primary }]}>View All</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.exceptionButtonRow}>
                    <TouchableOpacity
                      style={[styles.saveButton, { backgroundColor: theme.primary + '15' }]}
                      onPress={() => handleSaveException(
                        'EXCEPTION',
                        'Pending Expenses',
                        `${stats.pending_expenses_count} expense(s) awaiting approval`,
                        'pending_expenses',
                        'all'
                      )}
                    >
                      <Bookmark size={16} color={theme.primary} />
                      <Text style={[styles.saveButtonText, { color: theme.primary }]}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {stats && stats.voided_sales_count > 0 && (
                <View style={[styles.exceptionCard, { backgroundColor: theme.card }]}>
                  <View style={styles.exceptionMainContent}>
                    <View style={styles.exceptionHeader}>
                      <View style={[styles.exceptionIcon, { backgroundColor: theme.error + '20' }]}>
                        <XCircle size={20} color={theme.error} />
                      </View>
                      <View style={styles.exceptionInfo}>
                        <Text style={[styles.exceptionTitle, { color: theme.text }]}>
                          Voided Sales Today
                        </Text>
                        <Text style={[styles.exceptionCount, { color: theme.error }]}>
                          {stats.voided_sales_count} sale{stats.voided_sales_count !== 1 ? 's' : ''} voided
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.viewAllButton, { backgroundColor: theme.primary + '10' }]}
                      onPress={() => router.push('/boss/sales' as any)}
                    >
                      <Text style={[styles.viewAllText, { color: theme.primary }]}>View All</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.exceptionButtonRow}>
                    <TouchableOpacity
                      style={[styles.saveButton, { backgroundColor: theme.primary + '15' }]}
                      onPress={() => handleSaveException(
                        'ALERT',
                        'Voided Sales',
                        `${stats.voided_sales_count} sale(s) voided today`,
                        'voided_sales',
                        'today'
                      )}
                    >
                      <Bookmark size={16} color={theme.primary} />
                      <Text style={[styles.saveButtonText, { color: theme.primary }]}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {(!stats || (stats.unsettled_shifts_count === 0 && stats.pending_expenses_count === 0 && 
                stats.cash_differences.length === 0 && stats.voided_sales_count === 0)) && (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                    No exceptions found
                  </Text>
                </View>
              )}
            </>
          )}

          {selectedTab === 'activity' && (
            <>
              <View style={styles.activityHeader}>
                <Text style={[styles.pageTitle, { color: theme.text }]}>Recent Activity</Text>
                {recentActivity && recentActivity.length > 0 && (
                  <TouchableOpacity
                    style={[styles.clearAllButton, { backgroundColor: theme.error + '20' }]}
                    onPress={handleClearAllActivity}
                  >
                    <Trash2 size={16} color={theme.error} />
                    <Text style={[styles.clearAllText, { color: theme.error }]}>Clear All</Text>
                  </TouchableOpacity>
                )}
              </View>

              {recentActivity && recentActivity.length > 0 ? (
                recentActivity.map((log) => (
                  <View key={log.id} style={[styles.activityCard, { backgroundColor: theme.card }]}>
                    <View style={styles.activityHeader}>
                      <View style={styles.activityLeft}>
                        <Text style={[styles.activityAction, { color: theme.text }]}>
                          {log.action.toUpperCase()} {log.entity_type}
                        </Text>
                        <Text style={[styles.activityTime, { color: theme.textSecondary }]}>
                          {format(log.created_at, 'h:mm a')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.deleteActivityButton, { backgroundColor: theme.error + '15' }]}
                        onPress={() => handleDeleteActivity(log.id)}
                      >
                        <Trash2 size={16} color={theme.error} />
                      </TouchableOpacity>
                    </View>
                    {log.user_id && (
                      <Text style={[styles.activityUser, { color: theme.textSecondary }]}>
                        by User {log.user_id.slice(0, 8)}...
                      </Text>
                    )}
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                    No recent activity
                  </Text>
                </View>
              )}
            </>
          )}

          {selectedTab === 'saved' && (
            <>
              {savedRecords && savedRecords.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 12 }]}>Settlements</Text>
                  {savedRecords.map((record) => (
                    <TouchableOpacity
                      key={record.id}
                      style={[styles.savedCard, { backgroundColor: theme.card }]}
                      onPress={() => {
                        setSelectedSettlement(record);
                        setSettlementDetailModalVisible(true);
                      }}
                    >
                      <View style={styles.savedHeader}>
                        <View style={[styles.savedIcon, { backgroundColor: theme.success + '20' }]}>
                          <CheckCircle size={20} color={theme.success} />
                        </View>
                        <View style={styles.savedInfo}>
                          <Text style={[styles.savedTitle, { color: theme.text }]}>Settlement</Text>
                          <Text style={[styles.savedType, { color: theme.textSecondary }]}>
                            {format(record.created_at, 'MMM d, yyyy • h:mm a')}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.actionButton, { backgroundColor: theme.error + '15' }]}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleDeleteRecord(record.id);
                          }}
                        >
                          <Trash2 size={16} color={theme.error} />
                        </TouchableOpacity>
                      </View>
                      {record.notes && (
                        <Text style={[styles.savedNotes, { color: theme.textSecondary }]} numberOfLines={2}>
                          {record.notes}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {savedItems && savedItems.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 16, marginBottom: 12 }]}>Exceptions</Text>
                  {savedItems.map((item) => (
                  <View
                    key={item.id}
                    style={[styles.savedCard, { backgroundColor: theme.card }]}
                  >
                    <View style={styles.savedHeader}>
                      <View style={[styles.savedIcon, { backgroundColor: theme.primary + '20' }]}>
                        <Bookmark size={20} color={theme.primary} />
                      </View>
                      <View style={styles.savedInfo}>
                        <Text style={[styles.savedTitle, { color: theme.text }]}>
                          {item.title}
                        </Text>
                        <Text style={[styles.savedType, { color: theme.textSecondary }]}>
                          {item.type} • {item.status}
                        </Text>
                      </View>
                      <View style={styles.savedActions}>
                        <TouchableOpacity
                          style={[styles.actionButton, { backgroundColor: theme.primary + '15' }]}
                          onPress={() => handleEditItem(item)}
                        >
                          <Edit2 size={16} color={theme.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButton, { backgroundColor: theme.error + '15' }]}
                          onPress={() => handleDeleteItem(item.id)}
                        >
                          <Trash2 size={16} color={theme.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {item.notes && (
                      <Text style={[styles.savedNotes, { color: theme.textSecondary }]} numberOfLines={2}>
                        {item.notes}
                      </Text>
                    )}
                  </View>
                ))}
                </>
              )}

              {(!savedItems || savedItems.length === 0) && (!savedRecords || savedRecords.length === 0) && (
                <View style={styles.emptyState}>
                  <Bookmark size={64} color={theme.textSecondary} />
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                    No saved items
                  </Text>
                  <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
                    Save exceptions and alerts for quick access
                  </Text>
                </View>
              )}
            </>
          )}

          {selectedTab === 'database' && user?.role === 'developer' && (
            <DatabaseScreen />
          )}

          {selectedTab === 'carts' && (
            <>
              <View style={styles.cartsHeader}>
                <Text style={[styles.pageTitle, { color: theme.text }]}>Carts</Text>
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: theme.primary }]}
                  onPress={() => openCartModal()}
                >
                  <Plus size={20} color="#FFF" />
                  <Text style={styles.addButtonText}>Add Cart</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.filterButton, { backgroundColor: theme.card }]}
                onPress={() => setShowInactive(!showInactive)}
              >
                <Text style={[styles.filterButtonText, { color: theme.text }]}>
                  {showInactive ? 'Hide Inactive' : 'Show Inactive'}
                </Text>
              </TouchableOpacity>

              {allCarts && allCarts.length > 0 ? (
                allCarts.map((cart) => (
                  <View
                    key={cart.id}
                    style={[styles.cartListCard, { backgroundColor: theme.card, opacity: cart.is_active ? 1 : 0.6 }]}
                  >
                    <View style={styles.cartListHeader}>
                      <View style={styles.cartListInfo}>
                        <View style={styles.cartListTitleRow}>
                          <Text style={[styles.cartListName, { color: theme.text }]}>
                            {cart.name}
                          </Text>
                          {cart.is_active ? (
                            <View style={[styles.activeStatus, { backgroundColor: theme.success + '20' }]}>
                              <CheckCircle size={14} color={theme.success} />
                              <Text style={[styles.activeStatusText, { color: theme.success }]}>Active</Text>
                            </View>
                          ) : (
                            <View style={[styles.activeStatus, { backgroundColor: theme.textSecondary + '20' }]}>
                              <Text style={[styles.activeStatusText, { color: theme.textSecondary }]}>Inactive</Text>
                            </View>
                          )}
                        </View>
                        {cart.location && (
                          <Text style={[styles.cartListLocation, { color: theme.textSecondary }]}>
                            {cart.location}
                          </Text>
                        )}
                        {cart.notes && (
                          <Text style={[styles.cartListNotes, { color: theme.textSecondary }]} numberOfLines={2}>
                            {cart.notes}
                          </Text>
                        )}
                      </View>
                      <View style={styles.cartListActions}>
                        <TouchableOpacity
                          style={[styles.actionButton, { backgroundColor: theme.primary + '15' }]}
                          onPress={() => openCartModal(cart)}
                        >
                          <Edit2 size={16} color={theme.primary} />
                        </TouchableOpacity>
                        {cart.is_active ? (
                          <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: theme.error + '15' }]}
                            onPress={() => handleDeleteCart(cart.id, cart.name)}
                          >
                            <Trash2 size={16} color={theme.error} />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: theme.success + '15' }]}
                            onPress={() => handleRestoreCart(cart.id, cart.name)}
                          >
                            <CheckCircle size={16} color={theme.success} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <ShoppingBag size={64} color={theme.textSecondary} />
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                    No carts found
                  </Text>
                  <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
                    Add a cart to get started
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Saved Item</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <XCircle size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Title</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Enter title"
                placeholderTextColor={theme.textSecondary}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Notes</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Add notes..."
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={4}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Status</Text>
              <View style={styles.statusButtons}>
                <TouchableOpacity
                  style={[
                    styles.statusButton,
                    { borderColor: theme.primary },
                    editStatus === 'OPEN' && { backgroundColor: theme.primary }
                  ]}
                  onPress={() => setEditStatus('OPEN')}
                >
                  <Text style={[styles.statusButtonText, { color: editStatus === 'OPEN' ? '#fff' : theme.primary }]}>
                    Open
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.statusButton,
                    { borderColor: theme.success },
                    editStatus === 'RESOLVED' && { backgroundColor: theme.success }
                  ]}
                  onPress={() => setEditStatus('RESOLVED')}
                >
                  <Text style={[styles.statusButtonText, { color: editStatus === 'RESOLVED' ? '#fff' : theme.success }]}>
                    Resolved
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.background }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handleSaveEdit}
              >
                <Save size={18} color="#fff" />
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={cartModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCartModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingCart ? 'Edit Cart' : 'Add Cart'}
              </Text>
              <TouchableOpacity onPress={() => setCartModalVisible(false)}>
                <XCircle size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={cartName}
                onChangeText={setCartName}
                placeholder="Cart name"
                placeholderTextColor={theme.textSecondary}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Location</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={cartLocation}
                onChangeText={setCartLocation}
                placeholder="Optional location"
                placeholderTextColor={theme.textSecondary}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Notes for Workers</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={cartNotes}
                onChangeText={setCartNotes}
                placeholder="Optional notes that will be shown to workers"
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.background }]}
                onPress={() => setCartModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handleSaveCart}
              >
                <Save size={18} color="#fff" />
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={settlementDetailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettlementDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.settlementDetailScrollView}
            contentContainerStyle={styles.settlementDetailScrollContent}
          >
            <View style={[styles.settlementDetailContent, { backgroundColor: theme.card }]}>
              <View style={styles.settlementDetailHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Settlement Details</Text>
                <TouchableOpacity onPress={() => setSettlementDetailModalVisible(false)}>
                  <X size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              {selectedSettlement && (() => {
                let payload: any = {};
                try {
                  payload = JSON.parse(selectedSettlement.payload_json);
                } catch {
                  payload = {};
                }

                return (
                  <View style={styles.settlementDetailBody}>
                    <View style={[styles.settlementSection, { backgroundColor: theme.background }]}>
                      <Text style={[styles.settlementSectionTitle, { color: theme.text }]}>Shift Information</Text>
                      <View style={styles.settlementRow}>
                        <Text style={[styles.settlementLabel, { color: theme.textSecondary }]}>Shift ID</Text>
                        <Text style={[styles.settlementValue, { color: theme.text }]}>
                          {payload.shift_id || payload.shiftId || '—'}
                        </Text>
                      </View>
                      <View style={styles.settlementRow}>
                        <Text style={[styles.settlementLabel, { color: theme.textSecondary }]}>Cart</Text>
                        <Text style={[styles.settlementValue, { color: theme.text }]}>
                          {payload.cart_name || payload.cartName || '—'}
                        </Text>
                      </View>
                      <View style={styles.settlementRow}>
                        <Text style={[styles.settlementLabel, { color: theme.textSecondary }]}>Worker</Text>
                        <Text style={[styles.settlementValue, { color: theme.text }]}>
                          {payload.worker_name || payload.workerName || '—'}
                        </Text>
                      </View>
                      <View style={styles.settlementRow}>
                        <Text style={[styles.settlementLabel, { color: theme.textSecondary }]}>Date</Text>
                        <Text style={[styles.settlementValue, { color: theme.text }]}>
                          {payload.settlement_day || payload.settlementDay || (payload.clock_in ? format(new Date(payload.clock_in), 'MMM d, yyyy') : '—')}
                        </Text>
                      </View>
                      {payload.clock_in && (
                        <View style={styles.settlementRow}>
                          <Text style={[styles.settlementLabel, { color: theme.textSecondary }]}>Clock In</Text>
                          <Text style={[styles.settlementValue, { color: theme.text }]}>
                            {format(new Date(payload.clock_in), 'h:mm a')}
                          </Text>
                        </View>
                      )}
                      {payload.clock_out && (
                        <View style={styles.settlementRow}>
                          <Text style={[styles.settlementLabel, { color: theme.textSecondary }]}>Clock Out</Text>
                          <Text style={[styles.settlementValue, { color: theme.text }]}>
                            {format(new Date(payload.clock_out), 'h:mm a')}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={[styles.settlementSection, { backgroundColor: theme.background }]}>
                      <Text style={[styles.settlementSectionTitle, { color: theme.text }]}>Sales Summary</Text>
                      <View style={styles.settlementRow}>
                        <Text style={[styles.settlementLabel, { color: theme.textSecondary }]}>Gross Sales</Text>
                        <Text style={[styles.settlementValue, { color: theme.text }]}>
                          {payload.total_sales_cents !== undefined ? `₱${(payload.total_sales_cents / 100).toFixed(2)}` : '—'}
                        </Text>
                      </View>
                      <View style={styles.settlementRow}>
                        <Text style={[styles.settlementLabel, { color: theme.textSecondary }]}>Expenses</Text>
                        <Text style={[styles.settlementValue, { color: theme.error }]}>
                          {payload.approved_expenses_cash_drawer_cents !== undefined || payload.expenses_cents !== undefined
                            ? `₱${((payload.approved_expenses_cash_drawer_cents || payload.expenses_cents || 0) / 100).toFixed(2)}`
                            : '—'}
                        </Text>
                      </View>
                      <View style={styles.settlementRow}>
                        <Text style={[styles.settlementLabel, { color: theme.text, fontWeight: '600' }]}>Daily Net Sales</Text>
                        <Text style={[styles.settlementValue, { color: theme.primary, fontWeight: '700' }]}>
                          {payload.daily_net_sales_cents !== undefined || payload.dailyNetSalesCents !== undefined
                            ? `₱${((payload.daily_net_sales_cents || payload.dailyNetSalesCents || 0) / 100).toFixed(2)}`
                            : '—'}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.settlementSection, { backgroundColor: theme.background }]}>
                      <Text style={[styles.settlementSectionTitle, { color: theme.text }]}>Daily Net Sales Split (70/30)</Text>
                      <View style={styles.settlementRow}>
                        <Text style={[styles.settlementLabel, { color: theme.textSecondary }]}>Operation Manager (70%)</Text>
                        <Text style={[styles.settlementValue, { color: theme.success, fontWeight: '600' }]}>
                          {payload.manager_share_cents !== undefined || payload.managerShareCents !== undefined
                            ? `₱${((payload.manager_share_cents || payload.managerShareCents || 0) / 100).toFixed(2)}`
                            : '—'}
                        </Text>
                      </View>
                      <View style={styles.settlementRow}>
                        <Text style={[styles.settlementLabel, { color: theme.textSecondary }]}>Owner (30%)</Text>
                        <Text style={[styles.settlementValue, { color: theme.primary, fontWeight: '600' }]}>
                          {payload.owner_share_cents !== undefined || payload.ownerShareCents !== undefined
                            ? `₱${((payload.owner_share_cents || payload.ownerShareCents || 0) / 100).toFixed(2)}`
                            : '—'}
                        </Text>
                      </View>
                    </View>

                    {payload.notes && (
                      <View style={[styles.settlementSection, { backgroundColor: theme.background }]}>
                        <Text style={[styles.settlementSectionTitle, { color: theme.text }]}>Notes</Text>
                        <Text style={[styles.settlementNotesText, { color: theme.text }]}>
                          {payload.notes}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })()}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabsContainer: {
    height: 44,
    borderBottomWidth: 1,
  },
  tabsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    paddingHorizontal: 14,
    gap: 6,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  scrollView: {
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
    fontWeight: '700',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
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
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  profitCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  profitLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  profitValue: {
    fontSize: 32,
    fontWeight: '700',
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
    fontWeight: '600',
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
    fontWeight: '600',
  },
  exceptionCard: {
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  exceptionMainContent: {
    padding: 16,
  },
  exceptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  exceptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  exceptionInfo: {
    flex: 1,
  },
  exceptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  exceptionCount: {
    fontSize: 14,
    fontWeight: '500',
  },
  exceptionDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 52,
    paddingRight: 8,
    gap: 8,
  },
  exceptionDetail: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deleteIconButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewAllButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
    marginLeft: 52,
    alignSelf: 'flex-start',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  exceptionDetailText: {
    fontSize: 14,
    flex: 1,
  },
  exceptionDetailTime: {
    fontSize: 12,
  },
  exceptionDetailAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  clearAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activityCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  activityLeft: {
    flex: 1,
  },
  activityAction: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  activityTime: {
    fontSize: 12,
  },
  activityUser: {
    fontSize: 12,
  },
  deleteActivityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyText: {
    fontSize: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  exceptionButtonRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  savedCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  savedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  savedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  savedInfo: {
    flex: 1,
  },
  savedTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  savedType: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  savedNotes: {
    fontSize: 14,
    marginTop: 4,
  },
  savedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 16,
    overflow: 'hidden',
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
    fontWeight: '700',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
  },
  statusButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
    borderRadius: 8,
    gap: 6,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  cartsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  addButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  cartListCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cartListHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cartListInfo: {
    flex: 1,
    marginRight: 12,
  },
  cartListTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  cartListName: {
    fontSize: 18,
    fontWeight: '700',
  },
  activeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  activeStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cartListLocation: {
    fontSize: 14,
    marginBottom: 6,
  },
  cartListNotes: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  cartListActions: {
    flexDirection: 'row',
    gap: 8,
  },
  settlementDetailScrollView: {
    flex: 1,
  },
  settlementDetailScrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  settlementDetailContent: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  settlementDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  settlementDetailBody: {
    padding: 20,
  },
  settlementSection: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  settlementSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settlementLabel: {
    fontSize: 14,
    flex: 1,
  },
  settlementValue: {
    fontSize: 14,
    textAlign: 'right',
  },
  settlementNotesText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
