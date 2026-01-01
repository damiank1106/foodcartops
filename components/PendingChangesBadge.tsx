import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/contexts/theme.context';
import { usePendingChangesBadge } from '@/lib/utils/usePendingChangesBadge';

export default function PendingChangesBadge() {
  const { theme } = useTheme();
  const router = useRouter();
  const pendingCount = usePendingChangesBadge();

  return (
    <TouchableOpacity
      onPress={() => router.push('/pending-changes')}
      style={[styles.container, { borderColor: theme.border }]}
      accessibilityRole="button"
      accessibilityLabel={`Pending Changes: ${pendingCount}`}
    >
      <Text style={[styles.label, { color: theme.text }]}>Pending</Text>
      <View style={[styles.badge, { backgroundColor: pendingCount > 0 ? theme.warning : theme.border }]}>
        <Text style={[styles.badgeText, { color: pendingCount > 0 ? '#FFF' : theme.textSecondary }]}>
          {pendingCount}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
    marginRight: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  badge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
});
