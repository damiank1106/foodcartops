import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { Eye, EyeOff, Lock, Database, ChevronRight, Edit, X } from 'lucide-react-native';
import { UserRepository } from '@/lib/repositories';

export default function InventorySettingsScreen() {
  const { theme, isDark, setThemeMode } = useTheme();
  const { user, changePin, updateUser } = useAuth();
  const router = useRouter();

  const [currentPin, setCurrentPin] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [showCurrentPin, setShowCurrentPin] = useState<boolean>(false);
  const [showNewPin, setShowNewPin] = useState<boolean>(false);
  const [showConfirmPin, setShowConfirmPin] = useState<boolean>(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);



  const handleChangePinSubmit = async () => {
    if (!currentPin.trim() || !newPin.trim() || !confirmPin.trim()) {
      Alert.alert('Error', 'All fields are required');
      return;
    }

    if (newPin.length < 4 || newPin.length > 8) {
      Alert.alert('Error', 'New PIN must be 4-8 digits');
      return;
    }

    if (!/^\d+$/.test(newPin)) {
      Alert.alert('Error', 'PIN must contain only numbers');
      return;
    }

    if (newPin !== confirmPin) {
      Alert.alert('Error', 'New PIN and Confirm PIN do not match');
      return;
    }

    try {
      const success = await changePin(currentPin, newPin);
      if (success) {
        Alert.alert('Success', 'PIN updated successfully');
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
      } else {
        Alert.alert('Error', 'Current PIN is incorrect');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to change PIN');
    }
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
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Account</Text>
          <TouchableOpacity style={styles.accountRow} onPress={() => {
            setNewName(user?.name || '');
            setShowNameModal(true);
          }}>
            <View style={styles.accountLeft}>
              <Edit size={20} color={theme.text} />
              <Text style={[styles.accountLabel, { color: theme.text }]}>Name</Text>
            </View>
            <Text style={[styles.accountValue, { color: theme.textSecondary }]}>{user?.name}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Security</Text>

          <Text style={[styles.label, { color: theme.text }]}>Current PIN</Text>
          <View style={styles.pinInputContainer}>
            <TextInput
              style={[styles.pinInput, { backgroundColor: theme.background, color: theme.text }]}
              placeholder="Enter current PIN"
              placeholderTextColor={theme.textSecondary}
              value={currentPin}
              onChangeText={setCurrentPin}
              keyboardType="numeric"
              secureTextEntry={!showCurrentPin}
              maxLength={8}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowCurrentPin(!showCurrentPin)}
            >
              {showCurrentPin ? (
                <Eye size={20} color={theme.textSecondary} />
              ) : (
                <EyeOff size={20} color={theme.textSecondary} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: theme.text }]}>New PIN (4-8 digits)</Text>
          <View style={styles.pinInputContainer}>
            <TextInput
              style={[styles.pinInput, { backgroundColor: theme.background, color: theme.text }]}
              placeholder="Enter new PIN"
              placeholderTextColor={theme.textSecondary}
              value={newPin}
              onChangeText={setNewPin}
              keyboardType="numeric"
              secureTextEntry={!showNewPin}
              maxLength={8}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowNewPin(!showNewPin)}
            >
              {showNewPin ? (
                <Eye size={20} color={theme.textSecondary} />
              ) : (
                <EyeOff size={20} color={theme.textSecondary} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: theme.text }]}>Confirm New PIN</Text>
          <View style={styles.pinInputContainer}>
            <TextInput
              style={[styles.pinInput, { backgroundColor: theme.background, color: theme.text }]}
              placeholder="Re-enter new PIN"
              placeholderTextColor={theme.textSecondary}
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="numeric"
              secureTextEntry={!showConfirmPin}
              maxLength={8}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirmPin(!showConfirmPin)}
            >
              {showConfirmPin ? (
                <Eye size={20} color={theme.textSecondary} />
              ) : (
                <EyeOff size={20} color={theme.textSecondary} />
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.changePinButton, { backgroundColor: theme.primary }]}
            onPress={handleChangePinSubmit}
          >
            <Lock size={18} color="#fff" />
            <Text style={styles.changePinButtonText}>Change PIN</Text>
          </TouchableOpacity>
        </View>

      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Preferences</Text>

        <View style={styles.preferenceRow}>
          <Text style={[styles.preferenceLabel, { color: theme.text }]}>Dark Mode</Text>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Data</Text>
        <TouchableOpacity 
          style={styles.dataRow}
          onPress={() => router.push('/backup-data' as any)}
        >
          <View style={styles.dataLeft}>
            <Database size={20} color={theme.text} />
            <Text style={[styles.dataLabel, { color: theme.text }]}>Backup Data</Text>
          </View>
          <ChevronRight size={20} color={theme.textSecondary} />
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
              <Text style={[styles.modalInputLabel, { color: theme.textSecondary }]}>New Name</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
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
    paddingBottom: 80,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginTop: 12,
    marginBottom: 8,
  },
  pinInputContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  pinInput: {
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 4,
  },
  changePinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  changePinButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  preferenceLabel: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  dataLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dataLabel: {
    fontSize: 16,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  accountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountLabel: {
    fontSize: 16,
  },
  accountValue: {
    fontSize: 16,
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
  modalInputLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  modalInput: {
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
