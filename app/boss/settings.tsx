import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut, Moon, Sun, Database, Key, Info, Download, ChevronRight, X, Edit, RotateCcw, Trash2, AlertTriangle, Eye, EyeOff, BookOpen, Shield, RefreshCw } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { getRoleLabel } from '@/lib/utils/role-labels';
import { UserRepository, ShiftRepository, AuditRepository, InventoryStorageGroupRepository } from '@/lib/repositories';
import { resetDatabase } from '@/lib/database/init';
import { seedDatabase } from '@/lib/utils/seed';
import * as SyncService from '@/lib/services/sync.service';
import { SyncStatus } from '@/lib/services/sync.service';
import { isSyncEnabled } from '@/lib/supabase/client';
import SyncProgressModal from '@/components/SyncProgressModal';

export default function SettingsScreen() {
  const { theme, isDark, setThemeMode } = useTheme();
  const { user, logout, updateUser } = useAuth();
  const router = useRouter();
  const [showPinModal, setShowPinModal] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [showPinConfirmModal, setShowPinConfirmModal] = useState(false);
  const [showSecondConfirmModal, setShowSecondConfirmModal] = useState(false);
  const [pinConfirmValue, setPinConfirmValue] = useState('');
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<'reset' | 'wipe' | 'reset_inventory' | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);

  const auditRepo = new AuditRepository();

  useEffect(() => {
    if (user?.role === 'developer') {
      checkSyncEnabled();
      loadSyncStatus();
      const interval = setInterval(loadSyncStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const checkSyncEnabled = async () => {
    try {
      const enabled = await isSyncEnabled();
      setSyncEnabled(enabled);
    } catch (error) {
      console.error('[Settings] Failed to check sync enabled:', error);
    }
  };

  const loadSyncStatus = async () => {
    try {
      const status = await SyncService.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('[Settings] Failed to load sync status:', error);
    }
  };

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    try {
      await SyncService.syncNow('manual');
      await loadSyncStatus();
      Alert.alert('Success', 'Sync completed successfully');
    } catch (error) {
      console.error('[Settings] Manual sync failed:', error);
      Alert.alert('Error', 'Sync failed. Check console for details.');
    } finally {
      setIsManualSyncing(false);
    }
  };

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

  const toggleTheme = () => {
    setThemeMode(isDark ? 'light' : 'dark');
  };

  const handleChangePin = async () => {
    if (!newPin || !confirmPin) {
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
      const userRepo = new UserRepository();
      if (user?.id) {
        await userRepo.resetPin(user.id, newPin, user.id, user.role);
        
        Alert.alert('Success', 'PIN changed successfully');
        setShowPinModal(false);
        setNewPin('');
        setConfirmPin('');
        setShowNewPin(false);
        setShowConfirmPin(false);
      }
    } catch (error) {
      console.error('[Settings] Failed to change PIN:', error);
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
        await userRepo.updateWithAudit(user.id, { name: newName.trim() }, user.id, user.role, true);
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

  const handleResetDatabase = () => {
    setPendingDestructiveAction('reset');
    setPinConfirmValue('');
    setShowPinConfirmModal(true);
  };

  const handlePinConfirm = async () => {
    if (!pinConfirmValue || !user) {
      Alert.alert('Error', 'Please enter your PIN');
      return;
    }

    try {
      const userRepo = new UserRepository();
      const isValid = await userRepo.verifyPinForUser(user.id, pinConfirmValue);
      
      if (!isValid) {
        Alert.alert('Error', 'Incorrect PIN');
        await auditRepo.log({
          user_id: user.id,
          entity_type: 'admin_action',
          entity_id: 'pin_verify',
          action: 'confirm_pin_failed',
          new_data: JSON.stringify({ action: pendingDestructiveAction }),
        });
        return;
      }

      await auditRepo.log({
        user_id: user.id,
        entity_type: 'admin_action',
        entity_id: 'pin_verify',
        action: 'confirm_pin_success',
        new_data: JSON.stringify({ action: pendingDestructiveAction }),
      });

      setShowPinConfirmModal(false);
      setPinConfirmValue('');
      setShowSecondConfirmModal(true);
    } catch (error) {
      console.error('[Settings] PIN verify failed:', error);
      Alert.alert('Error', 'Failed to verify PIN');
    }
  };

  const handleResetInventory = () => {
    setPendingDestructiveAction('reset_inventory');
    setPinConfirmValue('');
    setShowPinConfirmModal(true);
  };

  const executeDestructiveAction = async () => {
    setShowSecondConfirmModal(false);
    
    if (pendingDestructiveAction === 'reset') {
      try {
        console.log('[Settings] Starting database reset...');
        await auditRepo.log({
          user_id: user?.id,
          entity_type: 'system',
          entity_id: 'reset_database',
          action: 'reset_database',
        });
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
    } else if (pendingDestructiveAction === 'wipe') {
      try {
        console.log('[Settings] Wiping workers and shifts...');
        const userRepo = new UserRepository();
        const shiftRepo = new ShiftRepository();
        const auditRepo = new AuditRepository();
        
        const workers = await userRepo.findAll();
        for (const worker of workers) {
          if (worker.role === 'operation_manager' && user) {
            await userRepo.update(worker.id, { is_active: 0 }, user.role);
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
    } else if (pendingDestructiveAction === 'reset_inventory') {
      try {
        console.log('[Settings] Resetting inventory...');
        const storageGroupRepo = new InventoryStorageGroupRepository();
        const result = await storageGroupRepo.resetToDefaults({
          user_id: user?.id || '',
        });
        
        Alert.alert(
          'Success',
          `Inventory reset complete.\n\n` +
          `• ${result.groups_deactivated} custom groups removed\n` +
          `• ${result.groups_created} default groups restored\n` +
          `• ${result.items_detached_to_none} items moved to "None"`
        );
      } catch (error) {
        console.error('[Settings] Reset inventory failed:', error);
        Alert.alert('Error', 'Failed to reset inventory.');
      }
    }
    
    setPendingDestructiveAction(null);
  };

  const handleWipeWorkersAndShifts = () => {
    setPendingDestructiveAction('wipe');
    setPinConfirmValue('');
    setShowPinConfirmModal(true);
  };

  const handlePrivacyPolicy = async () => {
    try {
      const url = 'https://damiank1106.github.io/foodcartops/';
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        await auditRepo.log({
          user_id: user?.id,
          entity_type: 'settings',
          entity_id: 'privacy_policy',
          action: 'open_privacy_policy',
        });
      } else {
        Alert.alert('Error', 'Unable to open Privacy Policy. Please try again.');
      }
    } catch (error) {
      console.error('[Settings] Failed to open Privacy Policy:', error);
      Alert.alert('Error', 'Unable to open Privacy Policy. Please try again.');
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
          <View style={styles.listItem}>
            <Text style={[styles.label, { color: theme.text }]}>Role</Text>
            <Text style={[styles.value, { color: theme.textSecondary }]}>
              {user?.role ? getRoleLabel(user.role) : 'N/A'}
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
          <TouchableOpacity 
            style={styles.listItem}
            onPress={() => router.push('/backup-data' as any)}
          >
            <View style={styles.listItemLeft}>
              <Download size={20} color={theme.text} />
              <Text style={[styles.label, { color: theme.text }]}>Backup Data</Text>
            </View>
            <ChevronRight size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {(user?.role === 'general_manager' || user?.role === 'developer') && (
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Developer Actions</Text>
            {user?.role === 'developer' && syncEnabled && (
              <>
                <View style={styles.listItem}>
                  <View style={styles.listItemLeft}>
                    <RefreshCw size={20} color={theme.text} />
                    <Text style={[styles.label, { color: theme.text }]}>Sync Status</Text>
                  </View>
                  <Text style={[styles.value, { color: theme.textSecondary }]}>
                    {syncStatus?.isRunning ? 'Syncing...' : syncStatus?.pendingCount ? `${syncStatus.pendingCount} pending` : 'Up to date'}
                  </Text>
                </View>
                {syncStatus?.lastSyncAt && (
                  <View style={styles.listItem}>
                    <View style={styles.listItemLeft}>
                      <Info size={20} color={theme.text} />
                      <Text style={[styles.label, { color: theme.text }]}>Last Sync</Text>
                    </View>
                    <Text style={[styles.value, { color: theme.textSecondary, fontSize: 12 }]}>
                      {new Date(syncStatus.lastSyncAt).toLocaleString()}
                    </Text>
                  </View>
                )}
                {syncStatus?.lastError && (
                  <View style={styles.listItem}>
                    <View style={styles.listItemLeft}>
                      <AlertTriangle size={20} color={theme.error} />
                      <Text style={[styles.label, { color: theme.error }]}>Last Error</Text>
                    </View>
                    <Text style={[styles.value, { color: theme.error, fontSize: 12 }]} numberOfLines={1}>
                      {syncStatus.lastError}
                    </Text>
                  </View>
                )}
                <TouchableOpacity 
                  style={styles.listItem} 
                  onPress={handleManualSync}
                  disabled={isManualSyncing}
                >
                  <View style={styles.listItemLeft}>
                    <RefreshCw size={20} color={theme.primary} />
                    <Text style={[styles.label, { color: theme.primary }]}>Manual Sync</Text>
                  </View>
                  {isManualSyncing ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <ChevronRight size={20} color={theme.textSecondary} />
                  )}
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.listItem} onPress={handleResetInventory}>
              <View style={styles.listItemLeft}>
                <Database size={20} color={theme.warning || '#F59E0B'} />
                <Text style={[styles.label, { color: theme.warning || '#F59E0B' }]}>Reset Inventory</Text>
              </View>
              <ChevronRight size={20} color={theme.textSecondary} />
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
            {user?.role === 'developer' && (
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
            )}
          </View>
        )}

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Help & Legal</Text>
          <TouchableOpacity
            style={styles.listItem}
            onPress={() => router.push('/boss/how-to-use' as any)}
          >
            <View style={styles.listItemLeft}>
              <BookOpen size={20} color={theme.text} />
              <Text style={[styles.label, { color: theme.text }]}>How to Use App</Text>
            </View>
            <ChevronRight size={20} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.listItem}
            onPress={handlePrivacyPolicy}
          >
            <View style={styles.listItemLeft}>
              <Shield size={20} color={theme.text} />
              <Text style={[styles.label, { color: theme.text }]}>Privacy Policy</Text>
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
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>New PIN (4-8 digits)</Text>
              <View style={[styles.inputWithIcon, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.inputField, { color: theme.text }]}
                  value={newPin}
                  onChangeText={setNewPin}
                  placeholder="Enter new PIN (4-8 digits)"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="number-pad"
                  maxLength={8}
                  secureTextEntry={!showNewPin}
                />
                <TouchableOpacity
                  onPress={() => setShowNewPin(!showNewPin)}
                  style={styles.eyeIcon}
                >
                  {showNewPin ? <Eye size={20} color={theme.textSecondary} /> : <EyeOff size={20} color={theme.textSecondary} />}
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Confirm New PIN</Text>
              <View style={[styles.inputWithIcon, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.inputField, { color: theme.text }]}
                  value={confirmPin}
                  onChangeText={setConfirmPin}
                  placeholder="Re-enter new PIN"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="number-pad"
                  maxLength={8}
                  secureTextEntry={!showConfirmPin}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPin(!showConfirmPin)}
                  style={styles.eyeIcon}
                >
                  {showConfirmPin ? <Eye size={20} color={theme.textSecondary} /> : <EyeOff size={20} color={theme.textSecondary} />}
                </TouchableOpacity>
              </View>

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

      <Modal
        visible={showPinConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowPinConfirmModal(false);
          setPendingDestructiveAction(null);
          setPinConfirmValue('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Confirm with PIN</Text>
              <TouchableOpacity onPress={() => {
                setShowPinConfirmModal(false);
                setPendingDestructiveAction(null);
                setPinConfirmValue('');
              }}>
                <X size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Enter your PIN to continue</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={pinConfirmValue}
                onChangeText={setPinConfirmValue}
                placeholder="Enter PIN"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                maxLength={8}
                secureTextEntry
                autoFocus
              />

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handlePinConfirm}
              >
                <Text style={styles.modalButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSecondConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowSecondConfirmModal(false);
          setPendingDestructiveAction(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderRow}>
                <AlertTriangle size={24} color={theme.error} />
                <Text style={[styles.modalTitle, { color: theme.text, marginLeft: 8 }]}>Are you sure?</Text>
              </View>
              <TouchableOpacity onPress={() => {
                setShowSecondConfirmModal(false);
                setPendingDestructiveAction(null);
              }}>
                <X size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.warningText, { color: theme.textSecondary }]}>
                {pendingDestructiveAction === 'reset' 
                  ? 'This will permanently delete ALL data and reset to factory defaults. This action cannot be undone.'
                  : pendingDestructiveAction === 'reset_inventory'
                  ? 'This will restore Inventory storage groups to defaults (Freezer, Cart, Packaging Supply, Condiments). All custom groups will be removed and items will be moved to "None". This action cannot be undone.'
                  : 'This will permanently delete all workers, shifts, and related data. This action cannot be undone.'}
              </Text>

              <View style={styles.confirmButtons}>
                <TouchableOpacity
                  style={[styles.confirmButton, { backgroundColor: theme.background }]}
                  onPress={() => {
                    setShowSecondConfirmModal(false);
                    setPendingDestructiveAction(null);
                  }}
                >
                  <Text style={[styles.confirmButtonText, { color: theme.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmButton, { backgroundColor: theme.error }]}
                  onPress={executeDestructiveAction}
                >
                  <Text style={[styles.confirmButtonText, { color: '#FFF' }]}>Reset</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

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
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputField: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  eyeIcon: {
    padding: 4,
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
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
