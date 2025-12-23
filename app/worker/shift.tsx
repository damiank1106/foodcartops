import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, MapPin, LogOut, Coins, CreditCard, Wallet, TrendingUp, Activity } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { CartRepository, ShiftRepository, SaleRepository, ExpenseRepository } from '@/lib/repositories';
import { format } from 'date-fns';

export default function WorkerShiftScreen() {
  const { theme } = useTheme();
  const { user, selectedCartId, activeShiftId, startShift, endShift } = useAuth();
  const [showStartModal, setShowStartModal] = useState<boolean>(false);
  const [selectedCart, setSelectedCart] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const queryClient = useQueryClient();

  const cartRepo = new CartRepository();
  const shiftRepo = new ShiftRepository();
  const saleRepo = new SaleRepository();
  const expenseRepo = new ExpenseRepository();

  const { data: carts, isLoading: cartsLoading } = useQuery({
    queryKey: ['carts'],
    queryFn: () => cartRepo.findAll(),
  });

  const { data: assignedShifts } = useQuery({
    queryKey: ['assigned-shifts', user?.id, user],
    queryFn: () => {
      if (!user) return [];
      return shiftRepo.getAssignedShifts(user.id);
    },
    enabled: !!user,
  });

  const { data: activeShift } = useQuery({
    queryKey: ['active-shift', activeShiftId, user?.id, user],
    queryFn: () => {
      if (!user) return null;
      return shiftRepo.getActiveShift(user.id);
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: shiftSales } = useQuery({
    queryKey: ['shift-sales', activeShiftId, activeShift, user?.id],
    queryFn: async () => {
      if (!activeShift) return [];
      const sales = await saleRepo.findAll({ worker_id: user?.id });
      return sales.filter(sale => sale.created_at >= activeShift.clock_in);
    },
    enabled: !!activeShift && !!user,
  });

  const { data: shiftExpenses } = useQuery({
    queryKey: ['shift-expenses', activeShiftId],
    queryFn: async () => {
      if (!activeShiftId) return [];
      return expenseRepo.getApprovedExpensesForShift(activeShiftId);
    },
    enabled: !!activeShiftId,
  });

  const { data: timeline } = useQuery({
    queryKey: ['shift-timeline', activeShiftId],
    queryFn: () => activeShiftId ? shiftRepo.getShiftTimeline(activeShiftId) : [],
    enabled: !!activeShiftId,
  });

  const { data: cartInfo } = useQuery({
    queryKey: ['cart', selectedCartId],
    queryFn: () => (selectedCartId ? cartRepo.findById(selectedCartId) : null),
    enabled: !!selectedCartId,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const openStartModal = (cartIdOrShiftId: string) => {
    setSelectedCart(cartIdOrShiftId);
    setShowStartModal(true);
  };

  const handleStartShift = async () => {
    try {
      await startShift(selectedCart, 0);
      setShowStartModal(false);
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-shifts'] });
      Alert.alert('Success', 'Shift started successfully!');
    } catch {
      Alert.alert('Error', 'Failed to start shift');
    }
  };

  const handleEndShift = () => {
    Alert.alert('End Shift', 'Are you sure you want to end your shift?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Shift',
        style: 'destructive',
        onPress: async () => {
          try {
            await endShift();
            queryClient.invalidateQueries({ queryKey: ['active-shift'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            Alert.alert('Success', 'Shift ended successfully!');
          } catch {
            Alert.alert('Error', 'Failed to end shift');
          }
        },
      },
    ]);
  };

  if (cartsLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const calculateTotals = () => {
    if (!shiftSales) return { cash: 0, card: 0, gcash: 0, total: 0, transactions: 0, cashExpenses: 0 };
    
    let cash = 0;
    let card = 0;
    let gcash = 0;
    
    shiftSales.forEach(sale => {
      sale.payments.forEach(payment => {
        const amount = payment.amount_cents / 100;
        if (payment.method === 'CASH') cash += amount;
        else if (payment.method === 'CARD') card += amount;
        else if (payment.method === 'GCASH') gcash += amount;
      });
    });

    let cashExpenses = 0;
    if (shiftExpenses) {
      shiftExpenses.forEach(expense => {
        if (expense.paid_from === 'CASH_DRAWER') {
          cashExpenses += expense.amount_cents / 100;
        }
      });
    }
    
    return {
      cash,
      card,
      gcash,
      total: cash + card + gcash,
      transactions: shiftSales.length,
      cashExpenses,
    };
  };

  if (activeShift) {
    const durationMs = Math.max(0, currentTime - activeShift.clock_in);
    const duration = Math.floor(durationMs / 1000 / 60);
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    const totals = calculateTotals();
    const startingCashDollars = (activeShift.starting_cash_cents || 0) / 100;
    const expectedCashDollars = startingCashDollars + totals.cash - totals.cashExpenses;

    return (
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.content}>
          <View style={[styles.activeShiftCard, { backgroundColor: theme.card }]}>
            <View style={[styles.statusBadge, { backgroundColor: theme.success + '20' }]}>
              <Clock size={16} color={theme.success} />
              <Text style={[styles.statusText, { color: theme.success }]}>Active Shift</Text>
            </View>

            <Text style={[styles.cartName, { color: theme.text }]}>{cartInfo?.name}</Text>
            {cartInfo?.location && (
              <View style={styles.locationRow}>
                <MapPin size={16} color={theme.textSecondary} />
                <Text style={[styles.location, { color: theme.textSecondary }]}>
                  {cartInfo.location}
                </Text>
              </View>
            )}
            {cartInfo?.notes && (
              <View style={[styles.notesCard, { backgroundColor: theme.background }]}>
                <Text style={[styles.notesLabel, { color: theme.textSecondary }]}>Boss Notes:</Text>
                <Text style={[styles.notesText, { color: theme.text }]}>{cartInfo.notes}</Text>
              </View>
            )}

            <View style={styles.timeRow}>
              <View style={styles.timeInfo}>
                <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>Clock In</Text>
                <Text style={[styles.timeValue, { color: theme.text }]}>
                  {format(new Date(activeShift.clock_in), 'h:mm a')}
                </Text>
              </View>
              <View style={styles.timeInfo}>
                <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>Duration</Text>
                <Text style={[styles.timeValue, { color: theme.primary }]}>
                  {hours}h {minutes}m
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Live Summary</Text>
            
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <View style={[styles.statIcon, { backgroundColor: theme.success + '20' }]}>
                  <Coins size={20} color={theme.success} />
                </View>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Cash Sales</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>₱{totals.cash.toFixed(2)}</Text>
              </View>
              
              <View style={styles.statItem}>
                <View style={[styles.statIcon, { backgroundColor: theme.primary + '20' }]}>
                  <CreditCard size={20} color={theme.primary} />
                </View>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Card</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>₱{totals.card.toFixed(2)}</Text>
              </View>
              
              <View style={styles.statItem}>
                <View style={[styles.statIcon, { backgroundColor: '#9333EA20' }]}>
                  <Wallet size={20} color="#9333EA" />
                </View>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>GCash</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>₱{totals.gcash.toFixed(2)}</Text>
              </View>
              
              <View style={styles.statItem}>
                <View style={[styles.statIcon, { backgroundColor: theme.primary + '20' }]}>
                  <TrendingUp size={20} color={theme.primary} />
                </View>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Total Sales</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>₱{totals.total.toFixed(2)}</Text>
              </View>
            </View>

            <View style={[styles.cashDrawer, { backgroundColor: theme.background }]}>
              <View style={styles.cashRow}>
                <Text style={[styles.cashLabel, { color: theme.textSecondary }]}>Starting Cash</Text>
                <Text style={[styles.cashValue, { color: theme.text }]}>₱{startingCashDollars.toFixed(2)}</Text>
              </View>
              <View style={styles.cashRow}>
                <Text style={[styles.cashLabel, { color: theme.textSecondary }]}>+ Cash Sales</Text>
                <Text style={[styles.cashValue, { color: theme.success }]}>+₱{totals.cash.toFixed(2)}</Text>
              </View>
              {totals.cashExpenses > 0 && (
                <View style={styles.cashRow}>
                  <Text style={[styles.cashLabel, { color: theme.textSecondary }]}>- Cash Expenses</Text>
                  <Text style={[styles.cashValue, { color: theme.error }]}>-₱{totals.cashExpenses.toFixed(2)}</Text>
                </View>
              )}
              <View style={[styles.cashRow, styles.cashRowTotal]}>
                <Text style={[styles.cashLabel, { color: theme.text }]}>Expected Cash</Text>
                <Text style={[styles.cashValueTotal, { color: theme.primary }]}>₱{expectedCashDollars.toFixed(2)}</Text>
              </View>
            </View>

            <View style={styles.transactionsInfo}>
              <Activity size={16} color={theme.primary} />
              <Text style={[styles.transactionsText, { color: theme.textSecondary }]}>
                {totals.transactions} transaction{totals.transactions !== 1 ? 's' : ''} completed
              </Text>
            </View>
          </View>

          {timeline && timeline.length > 0 && (
            <View style={[styles.timelineCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Timeline</Text>
              {timeline.map((event, index) => (
                <View key={index} style={styles.timelineItem}>
                  <View style={[styles.timelineDot, { backgroundColor: theme.primary }]} />
                  <View style={styles.timelineContent}>
                    <Text style={[styles.timelineType, { color: theme.text }]}>
                      {event.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Text>
                    <Text style={[styles.timelineTime, { color: theme.textSecondary }]}>
                      {format(new Date(event.timestamp), 'h:mm a')}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.endShiftButton, { backgroundColor: theme.error }]}
            onPress={handleEndShift}
          >
            <LogOut size={20} color="#FFF" />
            <Text style={styles.endShiftText}>End Shift</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>Start Your Shift</Text>
        
        {assignedShifts && assignedShifts.length > 0 && (
          <>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Assigned Shifts</Text>
            {assignedShifts.map((shift) => {
              const cart = carts?.find(c => c.id === shift.cart_id);
              return (
                <TouchableOpacity
                  key={shift.id}
                  style={[styles.cartCard, { backgroundColor: theme.card, borderColor: theme.primary, borderWidth: 2 }]}
                  onPress={() => openStartModal(shift.id)}
                >
                  <View style={styles.cartInfo}>
                    <Text style={[styles.cartCardName, { color: theme.text }]}>{cart?.name || 'Unknown Cart'}</Text>
                    {cart?.location && (
                      <View style={styles.locationRow}>
                        <MapPin size={16} color={theme.textSecondary} />
                        <Text style={[styles.location, { color: theme.textSecondary }]}>
                          {cart.location}
                        </Text>
                      </View>
                    )}
                    {cart?.notes && (
                      <View style={[styles.notesPreview, { backgroundColor: theme.background }]}>
                        <Text style={[styles.notesPreviewText, { color: theme.textSecondary }]} numberOfLines={2}>
                          Boss Notes: {cart.notes}
                        </Text>
                      </View>
                    )}
                    {shift.starting_cash_cents !== null && shift.starting_cash_cents > 0 && (
                      <Text style={[styles.assignedCash, { color: theme.primary }]}>
                        Starting Cash: ₱{(shift.starting_cash_cents / 100).toFixed(2)}
                      </Text>
                    )}
                  </View>
                  <Clock size={24} color={theme.primary} />
                </TouchableOpacity>
              );
            })}
          </>
        )}
        
        <Text style={[styles.subtitle, { color: theme.textSecondary, marginTop: assignedShifts && assignedShifts.length > 0 ? 24 : 0 }]}>All Carts</Text>

        {carts?.map((cart) => (
          <TouchableOpacity
            key={cart.id}
            style={[styles.cartCard, { backgroundColor: theme.card }]}
            onPress={() => openStartModal(cart.id)}
          >
            <View style={styles.cartInfo}>
              <Text style={[styles.cartCardName, { color: theme.text }]}>{cart.name}</Text>
              {cart.location && (
                <View style={styles.locationRow}>
                  <MapPin size={16} color={theme.textSecondary} />
                  <Text style={[styles.location, { color: theme.textSecondary }]}>
                    {cart.location}
                  </Text>
                </View>
              )}
              {cart.notes && (
                <View style={[styles.notesPreview, { backgroundColor: theme.background }]}>
                  <Text style={[styles.notesPreviewText, { color: theme.textSecondary }]} numberOfLines={2}>
                    Boss Notes: {cart.notes}
                  </Text>
                </View>
              )}
            </View>
            <Clock size={24} color={theme.primary} />
          </TouchableOpacity>
        ))}
      </View>

      <Modal
        visible={showStartModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStartModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Welcome</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Ready to start your shift?
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.background }]}
                onPress={() => setShowStartModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, { backgroundColor: theme.primary }]}
                onPress={handleStartShift}
              >
                <Text style={[styles.modalButtonText, { color: '#FFF' }]}>Start Shift</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    marginBottom: 24,
  },
  activeShiftCard: {
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  cartName: {
    fontSize: 24,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  location: {
    fontSize: 14,
  },
  timeInfo: {
    marginBottom: 16,
  },
  timeLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 20,
    fontWeight: '600' as const,
  },
  durationCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.02)',
    marginBottom: 24,
  },
  durationLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  durationValue: {
    fontSize: 32,
    fontWeight: '700' as const,
  },
  clockOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 12,
  },
  clockOutText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  cartCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cartInfo: {
    flex: 1,
  },
  cartCardName: {
    fontSize: 18,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
  },
  assignedCash: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginTop: 6,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 0,
  },
  summaryCard: {
    padding: 20,
    borderRadius: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statItem: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  cashDrawer: {
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 12,
  },
  cashRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  cashRowTotal: {
    borderTopWidth: 2,
    borderTopColor: 'rgba(0,0,0,0.1)',
    marginTop: 8,
    paddingTop: 12,
  },
  cashLabel: {
    fontSize: 14,
  },
  cashValue: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  cashValueTotal: {
    fontSize: 18,
    fontWeight: '700' as const,
  },
  transactionsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  transactionsText: {
    fontSize: 14,
  },
  timelineCard: {
    padding: 20,
    borderRadius: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  timelineContent: {
    flex: 1,
  },
  timelineType: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 2,
  },
  timelineTime: {
    fontSize: 12,
  },
  endShiftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 12,
    marginTop: 16,
    marginBottom: 32,
  },
  endShiftText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 32,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  notesCard: {
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  notesPreview: {
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  notesPreviewText: {
    fontSize: 12,
    fontStyle: 'italic' as const,
  },
});
