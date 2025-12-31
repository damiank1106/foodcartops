import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { LogOut, User } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { useRouter } from 'expo-router';
import SyncProgressModal from '@/components/SyncProgressModal';

export default function InventoryProfileScreen() {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [showSyncModal, setShowSyncModal] = React.useState(false);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          setShowSyncModal(true);
        },
      },
    ]);
  };

  const handleSyncSuccess = async () => {
    await logout();
    router.replace('/');
  };

  if (!user) {
    return null;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <View style={styles.iconContainer}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: theme.primary + '20' },
            ]}
          >
            <User size={32} color={theme.primary} />
          </View>
        </View>
        <Text style={[styles.name, { color: theme.text }]}>{user.name || 'USER'}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Account
        </Text>
        <TouchableOpacity
          style={[styles.menuItem, { borderBottomColor: theme.border }]}
          onPress={handleLogout}
        >
          <View style={styles.menuItemLeft}>
            <LogOut size={20} color={theme.error} />
            <Text style={[styles.menuItemText, { color: theme.error }]}>
              Logout
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <SyncProgressModal
        visible={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        onSuccess={handleSyncSuccess}
        onCancel={() => setShowSyncModal(false)}
        reason="logout"
        title="Synchronizing with Database"
        allowCancel={true}
      />
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
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  name: {
    fontSize: 24,
    fontWeight: '700' as const,
    textAlign: 'center',
    marginBottom: 4,
  },
  role: {
    fontSize: 16,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
});
