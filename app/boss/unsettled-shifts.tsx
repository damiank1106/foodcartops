import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, Stack } from 'expo-router';
import { Clock, ChevronRight, ArrowLeft } from 'lucide-react-native';
import { format } from 'date-fns';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { SettlementRepository } from '@/lib/repositories/settlement.repository';
import { onSyncComplete } from '@/lib/services/sync.service';

export default function UnsettledShiftsScreen() {
  const { theme } = useTheme();
  const { user, isBoss, isDeveloper } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const settlementRepo = new SettlementRepository();

  const handleBackToExceptions = () => {
    router.replace('/boss' as any);
  };

  useEffect(() => {
    const unsubscribe = onSyncComplete(() => {
      console.log('[UnsettledShifts] Sync completed, refetching unsettled shifts');
      queryClient.invalidateQueries({ queryKey: ['unsettled-shifts'] });
    });
    return unsubscribe;
  }, [queryClient]);

  const { data: unsettledShifts, isLoading } = useQuery({
    queryKey: ['unsettled-shifts', isBoss, isDeveloper],
    queryFn: async () => {
      if (isBoss || isDeveloper) {
        console.log('[UnsettledShifts] Fetching all unsettled shifts from local DB');
        const shifts = await settlementRepo.getAllUnsettledShifts();
        console.log(`[UnsettledShifts] Got ${shifts.length} unsettled shifts`);
        return shifts;
      }
      return [];
    },
    enabled: !!(isBoss || isDeveloper),
  });



  const handleShiftPress = (shiftId: string) => {
    router.push(`/settlement/${shiftId}` as any);
  };

  if (!user || (!isBoss && !isDeveloper)) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.error }]}>Access Denied</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleBackToExceptions}
            >
              <ArrowLeft size={24} color={theme.primary} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Unsettled Shifts</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {unsettledShifts?.length || 0} shift{unsettledShifts?.length !== 1 ? 's' : ''} pending settlement
          </Text>
        </View>

        {unsettledShifts && unsettledShifts.length > 0 ? (
          unsettledShifts.map((shift) => (
            <TouchableOpacity
              key={shift.shift_id}
              style={[styles.shiftCard, { backgroundColor: theme.card }]}
              onPress={() => handleShiftPress(shift.shift_id)}
            >
              <View style={[styles.iconContainer, { backgroundColor: theme.warning + '20' }]}>
                <Clock size={24} color={theme.warning} />
              </View>
              <View style={styles.shiftInfo}>
                <Text style={[styles.workerName, { color: theme.text }]}>{shift.worker_name}</Text>
                <Text style={[styles.cartName, { color: theme.textSecondary }]}>{shift.cart_name}</Text>
                <Text style={[styles.shiftTime, { color: theme.textSecondary }]}>
                  Ended: {format(shift.clock_out, 'MMM d, yyyy • h:mm a')}
                </Text>
              </View>
              <ChevronRight size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Clock size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>All Caught Up!</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No unsettled shifts at this time
            </Text>
          </View>
        )}
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
  header: {
    marginTop: 16,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  shiftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
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
    marginRight: 16,
  },
  shiftInfo: {
    flex: 1,
  },
  workerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cartName: {
    fontSize: 14,
    marginBottom: 4,
  },
  shiftTime: {
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  headerButton: {
    padding: 8,
    marginRight: 8,
  },
});
