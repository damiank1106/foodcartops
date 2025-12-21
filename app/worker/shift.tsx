import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, LogOut } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { CartRepository, ShiftRepository } from '@/lib/repositories';
import { format } from 'date-fns';

export default function WorkerShiftScreen() {
  const { theme } = useTheme();
  const { user, selectedCartId, activeShiftId, startShift, endShift } = useAuth();

  const cartRepo = new CartRepository();
  const shiftRepo = new ShiftRepository();

  const { data: carts, isLoading: cartsLoading } = useQuery({
    queryKey: ['carts'],
    queryFn: () => cartRepo.findAll(),
  });

  const { data: activeShift } = useQuery({
    queryKey: ['active-shift', activeShiftId, user?.id, user],
    queryFn: () => {
      if (!user) return null;
      return shiftRepo.getActiveShift(user.id);
    },
    enabled: !!user,
  });

  const { data: cartInfo } = useQuery({
    queryKey: ['cart', selectedCartId],
    queryFn: () => (selectedCartId ? cartRepo.findById(selectedCartId) : null),
    enabled: !!selectedCartId,
  });

  const handleClockIn = async (cartId: string) => {
    try {
      await startShift(cartId);
      Alert.alert('Success', 'Shift started successfully!');
    } catch {
      Alert.alert('Error', 'Failed to start shift');
    }
  };

  const handleClockOut = () => {
    Alert.alert('Clock Out', 'Are you sure you want to end your shift?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clock Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await endShift();
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

  if (activeShift) {
    const duration = Math.floor((Date.now() - activeShift.clock_in) / 1000 / 60);
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;

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

            <View style={styles.timeInfo}>
              <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>Clock In</Text>
              <Text style={[styles.timeValue, { color: theme.text }]}>
                {format(new Date(activeShift.clock_in), 'h:mm a')}
              </Text>
            </View>

            <View style={styles.durationCard}>
              <Text style={[styles.durationLabel, { color: theme.textSecondary }]}>Duration</Text>
              <Text style={[styles.durationValue, { color: theme.primary }]}>
                {hours}h {minutes}m
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.clockOutButton, { backgroundColor: theme.error }]}
              onPress={handleClockOut}
            >
              <LogOut size={20} color="#FFF" />
              <Text style={styles.clockOutText}>Clock Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>Select a Cart to Clock In</Text>

        {carts?.map((cart) => (
          <TouchableOpacity
            key={cart.id}
            style={[styles.cartCard, { backgroundColor: theme.card }]}
            onPress={() => handleClockIn(cart.id)}
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
            </View>
            <Clock size={24} color={theme.primary} />
          </TouchableOpacity>
        ))}
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
});
