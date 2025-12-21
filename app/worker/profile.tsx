import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut, Moon, Sun, User as UserIcon, Key, ChevronRight, X, Info, ExternalLink } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';

export default function WorkerProfileScreen() {
  const { theme, isDark, setThemeMode } = useTheme();
  const { user, logout, changePin } = useAuth();
  const router = useRouter();
  const [showPinModal, setShowPinModal] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isChanging, setIsChanging] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/' as any);
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

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={[styles.header, { backgroundColor: theme.card }]}>
          <View style={[styles.avatar, { backgroundColor: theme.primary + '20' }]}>
            <UserIcon size={32} color={theme.primary} />
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{user?.name}</Text>
          <Text style={[styles.role, { color: theme.textSecondary }]}>Worker</Text>
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
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Information</Text>
          <TouchableOpacity style={styles.listItem} onPress={() => setShowInfoModal(true)}>
            <View style={styles.listItemLeft}>
              <Info size={20} color={theme.text} />
              <Text style={[styles.label, { color: theme.text }]}>How to Use App</Text>
            </View>
            <ChevronRight size={20} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={() => Alert.alert('Privacy Policy', 'Privacy policy link will be added soon')}>
            <View style={styles.listItemLeft}>
              <ExternalLink size={20} color={theme.text} />
              <Text style={[styles.label, { color: theme.text }]}>Privacy Policy</Text>
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
        visible={showInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>How to Use App</Text>
              <TouchableOpacity onPress={() => setShowInfoModal(false)}>
                <X size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.instructionSection}>
                <Text style={[styles.instructionTitle, { color: theme.text }]}>Starting Your Shift</Text>
                <Text style={[styles.instructionText, { color: theme.textSecondary }]}>
                  1. Go to &ldquo;My Shift&rdquo; tab{`\n`}
                  2. Tap &ldquo;Select a Cart to begin&rdquo;{`\n`}
                  3. Choose your assigned cart{`\n`}
                  4. Enter the amount of money in the drawer{`\n`}
                  5. Tap &ldquo;Start Shift&rdquo;
                </Text>
              </View>

              <View style={styles.instructionSection}>
                <Text style={[styles.instructionTitle, { color: theme.text }]}>Recording Sales</Text>
                <Text style={[styles.instructionText, { color: theme.textSecondary }]}>
                  1. Go to &ldquo;New Sale&rdquo; tab{`\n`}
                  2. Tap on products to add them to cart{`\n`}
                  3. Adjust quantities using + and - buttons{`\n`}
                  4. Select payment method (Cash, GCash, Card){`\n`}
                  5. Tap &ldquo;Complete Sale&rdquo; to finish
                </Text>
              </View>

              <View style={styles.instructionSection}>
                <Text style={[styles.instructionTitle, { color: theme.text }]}>Adding Expenses</Text>
                <Text style={[styles.instructionText, { color: theme.textSecondary }]}>
                  1. Go to &ldquo;Expenses&rdquo; tab{`\n`}
                  2. Tap &ldquo;Add Expense&rdquo;{`\n`}
                  3. Select category and enter amount{`\n`}
                  4. Choose where payment came from{`\n`}
                  5. Optionally take a photo of receipt{`\n`}
                  6. Tap &ldquo;Submit&rdquo; for approval
                </Text>
              </View>

              <View style={styles.instructionSection}>
                <Text style={[styles.instructionTitle, { color: theme.text }]}>Ending Your Shift</Text>
                <Text style={[styles.instructionText, { color: theme.textSecondary }]}>
                  1. Go to &ldquo;My Shift&rdquo; tab{`\n`}
                  2. Review your shift summary{`\n`}
                  3. Count cash in drawer{`\n`}
                  4. Enter actual ending cash amount{`\n`}
                  5. Tap &ldquo;End Shift&rdquo; to complete
                </Text>
              </View>

              <View style={styles.instructionSection}>
                <Text style={[styles.instructionTitle, { color: theme.text }]}>Logout</Text>
                <Text style={[styles.instructionText, { color: theme.textSecondary }]}>
                  Go to &ldquo;Profile&rdquo; tab and tap the &ldquo;Logout&rdquo; button when you&apos;re done.
                </Text>
              </View>
            </ScrollView>

            <View style={styles.infoModalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={() => setShowInfoModal(false)}
              >
                <Text style={styles.modalButtonText}>Got It</Text>
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
  header: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  role: {
    fontSize: 14,
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
  instructionSection: {
    marginBottom: 24,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 14,
    lineHeight: 22,
  },
  infoModalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
});
