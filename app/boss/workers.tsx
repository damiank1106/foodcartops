import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { User, Clock, CheckCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { UserRepository, ShiftRepository } from '@/lib/repositories';

export default function WorkersScreen() {
  const { theme } = useTheme();
  const userRepo = new UserRepository();
  const shiftRepo = new ShiftRepository();

  const { data: workers, isLoading } = useQuery({
    queryKey: ['workers'],
    queryFn: async () => {
      const allWorkers = await userRepo.getActiveWorkers();
      const workersWithShifts = await Promise.all(
        allWorkers.map(async (worker) => {
          const activeShift = await shiftRepo.getActiveShift(worker.id);
          return { ...worker, activeShift };
        })
      );
      return workersWithShifts;
    },
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
        {workers?.map((worker) => (
          <View key={worker.id} style={[styles.workerCard, { backgroundColor: theme.card }]}>
            <View style={[styles.avatar, { backgroundColor: theme.primary + '20' }]}>
              <User size={24} color={theme.primary} />
            </View>
            <View style={styles.workerInfo}>
              <Text style={[styles.workerName, { color: theme.text }]}>{worker.name}</Text>
              <Text style={[styles.workerPin, { color: theme.textSecondary }]}>PIN: {worker.pin}</Text>
            </View>
            <View style={styles.status}>
              {worker.activeShift ? (
                <View style={[styles.statusBadge, { backgroundColor: theme.success + '20' }]}>
                  <CheckCircle size={16} color={theme.success} />
                  <Text style={[styles.statusText, { color: theme.success }]}>Active</Text>
                </View>
              ) : (
                <View style={[styles.statusBadge, { backgroundColor: theme.textSecondary + '20' }]}>
                  <Clock size={16} color={theme.textSecondary} />
                  <Text style={[styles.statusText, { color: theme.textSecondary }]}>Off</Text>
                </View>
              )}
            </View>
          </View>
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
  workerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  workerInfo: {
    flex: 1,
  },
  workerName: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  workerPin: {
    fontSize: 14,
  },
  status: {
    marginLeft: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
});
