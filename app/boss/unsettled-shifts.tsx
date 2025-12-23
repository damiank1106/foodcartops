import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, Stack } from 'expo-router';
import { Clock, ChevronRight, Bookmark, ArrowLeft } from 'lucide-react-native';
import { format } from 'date-fns';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { SettlementRepository } from '@/lib/repositories/settlement.repository';
import { BossSavedItemsRepository } from '@/lib/repositories/boss-saved-items.repository';

export default function UnsettledShiftsScreen() {
  const { theme } = useTheme();
  const { user, assignedCartIds, isBoss } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const settlementRepo = new SettlementRepository();
  const savedItemsRepo = new BossSavedItemsRepository();

  const handleBackToExceptions = () => {
    router.replace('/boss');
  };

  const { data: unsettledShifts, isLoading } = useQuery({
    queryKey: ['unsettled-shifts', assignedCartIds, isBoss],
    queryFn: () => {
      if (isBoss) {
        return settlementRepo.getUnsettledShifts();
      }
      return Promise.resolve([]);
    },
    enabled: !!isBoss,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ shiftId, workerName, cartName }: { shiftId: string; workerName: string; cartName: string }) => {
      if (!user) throw new Error('Not authenticated');
      const existing = await savedItemsRepo.findByLinkedEntity('shift', shiftId);
      if (existing) {
        Alert.alert('Already Saved', 'This shift is already in your saved items');
        return;
      }
      await savedItemsRepo.create({
        type: 'EXCEPTION',
        title: `Unsettled Shift: ${workerName}`,
        notes: `Cart: ${cartName}. Shift needs settlement.`,
        severity: 'MEDIUM',
        linked_entity_type: 'shift',
        linked_entity_id: shiftId,
        created_by_user_id: user.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-items'] });
      Alert.alert('Success', 'Shift saved to your Saved tab');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to save shift');
    },
  });

  const handleShiftPress = (shiftId: string) => {
    router.push(`/settlement/${shiftId}` as any);
  };

  if (!user || !isBoss) {
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
            >
              <TouchableOpacity
                style={styles.mainContent}
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
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.primary + '20' }]}
                onPress={() => saveMutation.mutate({ 
                  shiftId: shift.shift_id, 
                  workerName: shift.worker_name,
                  cartName: shift.cart_name 
                })}
                disabled={saveMutation.isPending}
              >
                <Bookmark size={18} color={theme.primary} />
              </TouchableOpacity>
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
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
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
