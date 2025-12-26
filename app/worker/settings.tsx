import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut, Moon, Sun, Database, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';

export default function WorkerSettingsScreen() {
  const { theme, isDark, setThemeMode } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/');
        },
      },
    ]);
  };

  const toggleTheme = () => {
    setThemeMode(isDark ? 'light' : 'dark');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Account</Text>
          <View style={styles.listItem}>
            <Text style={[styles.label, { color: theme.text }]}>Name</Text>
            <Text style={[styles.value, { color: theme.textSecondary }]}>{user?.name}</Text>
          </View>
          <View style={styles.listItem}>
            <Text style={[styles.label, { color: theme.text }]}>Role</Text>
            <Text style={[styles.value, { color: theme.textSecondary }]}>
              {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'N/A'}
            </Text>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Preferences</Text>
          <TouchableOpacity style={styles.listItem} onPress={toggleTheme}>
            <View style={styles.listItemLeft}>
              {isDark ? <Moon size={20} color={theme.text} /> : <Sun size={20} color={theme.text} />}
              <Text style={[styles.label, { color: theme.text }]}>Dark Mode</Text>
            </View>
            <Text style={[styles.value, { color: theme.textSecondary }]}>
              {isDark ? 'On' : 'Off'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Data</Text>
          <TouchableOpacity 
            style={styles.listItem}
            onPress={() => router.push('/backup-data' as any)}
          >
            <View style={styles.listItemLeft}>
              <Database size={20} color={theme.text} />
              <Text style={[styles.label, { color: theme.text }]}>Backup Data</Text>
            </View>
            <ChevronRight size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: theme.error }]}
          onPress={handleLogout}
        >
          <LogOut size={20} color="#FFF" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
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
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: 16,
  },
  value: {
    fontSize: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  logoutText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
