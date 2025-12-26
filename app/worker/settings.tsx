import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut, Moon, Sun, Database, ChevronRight, Edit, X } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { UserRepository } from '@/lib/repositories';

export default function WorkerSettingsScreen() {
  const { theme, isDark, setThemeMode } = useTheme();
  const { user, logout, updateUser } = useAuth();
  const router = useRouter();
  const [showNameModal, setShowNameModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);

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

  const handleChangeName = async () => {
    if (!newName.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }

    if (newName.trim() === user?.name) {
      Alert.alert('Error', 'Please enter a different name');
      return;
    }

    setIsUpdatingName(true);
    try {
      const userRepo = new UserRepository();
      if (user?.id) {
        await userRepo.updateWithAudit(user.id, { name: newName.trim() }, user.id);
        await updateUser();
        Alert.alert('Success', 'Name updated successfully.');
        setShowNameModal(false);
        setNewName('');
      }
    } catch (error) {
      console.error('[Settings] Failed to update name:', error);
      Alert.alert('Error', 'Failed to update name');
    } finally {
      setIsUpdatingName(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Account</Text>
          <TouchableOpacity style={styles.listItem} onPress={() => {
            setNewName(user?.name || '');
            setShowNameModal(true);
          }}>
            <View style={styles.listItemLeft}>
              <Edit size={20} color={theme.text} />
              <Text style={[styles.label, { color: theme.text }]}>Name</Text>
            </View>
            <Text style={[styles.value, { color: theme.textSecondary }]}>{user?.name}</Text>
          </TouchableOpacity>
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

      <Modal
        visible={showNameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Change Name</Text>
              <TouchableOpacity onPress={() => setShowNameModal(false)}>
                <X size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>New Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={newName}
                onChangeText={setNewName}
                placeholder="Enter new name"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="words"
                autoFocus
              />

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handleChangeName}
                disabled={isUpdatingName}
              >
                {isUpdatingName ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.modalButtonText}>Update Name</Text>
                )}
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  modalButton: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
