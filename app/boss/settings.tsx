import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut, Moon, Sun, Database, Key, Info, Download, ChevronRight, X, Edit, RotateCcw, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { UserRepository, ShiftRepository, AuditRepository } from '@/lib/repositories';
import { resetDatabase } from '@/lib/database/init';
import { seedDatabase } from '@/lib/utils/seed';

export default function SettingsScreen() {
  const { theme, isDark, setThemeMode } = useTheme();
  const { user, logout, changePin } = useAuth();
  const router = useRouter();
  const [showPinModal, setShowPinModal] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isChanging, setIsChanging] = useState(false);
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

  const handleChangePin = async () => {
    if (!oldPin || !newPin || !confirmPin) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (newPin !== confirmPin) {
      Alert.alert('Error', 'New PIN and confirmation do not match');
      return;
    }

    if (newPin.length < 4 || newPin.length > 8) {
      Alert.alert('Error', 'PIN must be between 4 and 8 digits');
      return;
    }

    if (!/^\d+$/.test(newPin)) {
      Alert.alert('Error', 'PIN must contain only numbers');
      return;
    }

    setIsChanging(true);
    try {
      const success = await changePin(oldPin, newPin);
      if (success) {
        Alert.alert('Success', 'PIN changed successfully');
        setShowPinModal(false);
        setOldPin('');
        setNewPin('');
        setConfirmPin('');
      } else {
        Alert.alert('Error', 'Current PIN is incorrect');
      }
    } catch {
      Alert.alert('Error', 'Failed to change PIN');
    } finally {
      setIsChanging(false);
    }
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
        await userRepo.update(user.id, { name: newName.trim() });
        Alert.alert('Success', 'Name updated successfully. Please re-login to see changes.');
        setShowNameModal(false);
        setNewName('');
        setTimeout(() => {
          logout();
          router.replace('/');
        }, 1500);
      }
    } catch (error) {
      console.error('[Settings] Failed to update name:', error);
      Alert.alert('Error', 'Failed to update name');
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleResetDatabase = () => {
    Alert.alert(
      'Reset Database',
      'This will delete ALL data and reset to factory defaults. Only the Boss account with PIN 1234 will remain. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('[Settings] Starting database reset...');
              await logout();
              await resetDatabase();
              await seedDatabase();
              Alert.alert('Success', 'Database reset complete. Please login with PIN 1234', [
                { text: 'OK', onPress: () => router.replace('/') },
              ]);
            } catch (error) {
              console.error('[Settings] Reset failed:', error);
              Alert.alert('Error', 'Failed to reset database. Please restart the app.');
            }
          },
        },
      ]
    );
  };

  const handleWipeWorkersAndShifts = () => {
    Alert.alert(
      'Wipe Workers & Shifts',
      'This will delete all workers, shifts, sales, and related data. Boss account will remain. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('[Settings] Wiping workers and shifts...');
              const userRepo = new UserRepository();
              const shiftRepo = new ShiftRepository();
              const auditRepo = new AuditRepository();
              
              const workers = await userRepo.findAll();
              for (const worker of workers) {
                if (worker.role === 'worker') {
                  await userRepo.update(worker.id, { is_active: 0 });
                  await auditRepo.log({
                    user_id: user?.id,
                    entity_type: 'user',
                    entity_id: worker.id,
                    action: 'delete',
                    old_data: JSON.stringify(worker),
                  });
                }
              }
              
              const shifts = await shiftRepo.getShifts();
              for (const shift of shifts) {
                await shiftRepo.deleteShift(shift.id);
              }
              
              await auditRepo.log({
                user_id: user?.id,
                entity_type: 'system',
                entity_id: 'wipe_workers_shifts',
                action: 'wipe_workers_shifts',
              });
              
              Alert.alert('Success', 'All workers and shifts have been removed.');
            } catch (error) {
              console.error('[Settings] Wipe failed:', error);
              Alert.alert('Error', 'Failed to wipe data.');
            }
          },
        },
      ]
    );
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
          <View style={styles.listItem}>
            <Text style={[styles.label, { color: theme.text }]}>Role</Text>
            <Text style={[styles.value, { color: theme.textSecondary }]}>
              {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'N/A'}
            </Text>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Security</Text>
          <TouchableOpacity style={styles.listItem} onPress={() => setShowPinModal(true)}>
            <View style={styles.listItemLeft}>
              <Key size={20} color={theme.text} />
              <Text style={[styles.label, { color: theme.text }]}>Change PIN</Text>
            </View>
            <ChevronRight size={20} color={theme.textSecondary} />
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
          <TouchableOpacity style={styles.listItem}>
            <View style={styles.listItemLeft}>
              <Download size={20} color={theme.text} />
              <Text style={[styles.label, { color: theme.text }]}>Backup Data</Text>
            </View>
            <Text style={[styles.value, { color: theme.textSecondary }]}>Coming Soon</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={handleWipeWorkersAndShifts}>
            <View style={styles.listItemLeft}>
              <Trash2 size={20} color={theme.warning || '#F59E0B'} />
              <Text style={[styles.label, { color: theme.warning || '#F59E0B' }]}>Wipe Workers & Shifts</Text>
            </View>
            <ChevronRight size={20} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={handleResetDatabase}>
            <View style={styles.listItemLeft}>
              <RotateCcw size={20} color={theme.error} />
              <Text style={[styles.label, { color: theme.error }]}>Reset Database</Text>
            </View>
            <ChevronRight size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>About</Text>
          <View style={styles.listItem}>
            <View style={styles.listItemLeft}>
              <Info size={20} color={theme.text} />
              <Text style={[styles.label, { color: theme.text }]}>Version</Text>
            </View>
            <Text style={[styles.value, { color: theme.textSecondary }]}>1.0.0</Text>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Developer</Text>
          <TouchableOpacity
            style={styles.listItem}
            onPress={() => router.push('/boss/debug' as any)}
          >
            <View style={styles.listItemLeft}>
              <Database size={20} color={theme.text} />
              <Text style={[styles.label, { color: theme.text }]}>Database Debug</Text>
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
        visible={showPinModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPinModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Change PIN</Text>
              <TouchableOpacity onPress={() => setShowPinModal(false)}>
                <X size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Current PIN</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={oldPin}
                onChangeText={setOldPin}
                placeholder="Enter current PIN"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                maxLength={8}
                secureTextEntry
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>New PIN (4-8 digits)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={newPin}
                onChangeText={setNewPin}
                placeholder="Enter new PIN (4-8 digits)"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                maxLength={8}
                secureTextEntry
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Confirm New PIN</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={confirmPin}
                onChangeText={setConfirmPin}
                placeholder="Re-enter new PIN"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                maxLength={8}
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handleChangePin}
                disabled={isChanging}
              >
                {isChanging ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.modalButtonText}>Change PIN</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    marginTop: 12,
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
