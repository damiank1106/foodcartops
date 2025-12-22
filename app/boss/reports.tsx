import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { Archive } from 'lucide-react-native';

export default function InventoryScreen() {
  const { theme } = useTheme();

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={[styles.placeholder, { backgroundColor: theme.card }]}>
          <Archive size={48} color={theme.primary} />
          <Text style={[styles.placeholderTitle, { color: theme.text }]}>
            Inventory Management
          </Text>
          <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
            Inventory features coming in Phase 7
          </Text>
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
  placeholder: {
    padding: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
  },
  placeholderText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
