import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Alert, TextInput } from 'react-native';
import { Stack } from 'expo-router';
import { CheckCircle, AlertTriangle, RefreshCw, Trash2, Database, Eye, EyeOff, Edit3, Save, X as XIcon } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import * as SyncService from '@/lib/services/sync.service';
import { SyncStatus } from '@/lib/services/sync.service';
import { 
  isSyncEnabled, 
  getSupabaseCredentials, 
  validateSupabaseUrl, 
  validateSupabaseKey,
  saveSupabaseCredentials,
  clearSupabaseCredentials 
} from '@/lib/supabase/client';

export default function BackupDataScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showOutboxModal, setShowOutboxModal] = useState(false);
  const [outboxRows, setOutboxRows] = useState<any[]>([]);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentKey, setCurrentKey] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [editedUrl, setEditedUrl] = useState('');
  const [editedKey, setEditedKey] = useState('');

  useEffect(() => {
    loadStatus();
    loadCredentials();
    const unsubscribe = SyncService.subscribeSyncStatus((status) => {
      setSyncStatus(status);
    });
    return unsubscribe;
  }, []);

  const loadCredentials = async () => {
    try {
      const enabled = await isSyncEnabled();
      setCredentialsLoaded(enabled);
      const creds = await getSupabaseCredentials();
      if (creds) {
        setCurrentUrl(creds.url);
        setCurrentKey(creds.key);
        setEditedUrl(creds.url);
        setEditedKey(creds.key);
      }
    } catch (error) {
      console.error('[BackupData] Failed to load credentials:', error);
    }
  };

  const loadStatus = async () => {
    try {
      const status = await SyncService.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('[BackupData] Failed to load status:', error);
    }
  };

  const handleSyncNow = async () => {
    setShowProgressModal(true);
    try {
      const result = await SyncService.syncNow('manual');
      if (result.success) {
        Alert.alert('Success', 'Backup completed successfully');
      } else {
        Alert.alert('Failed', result.error || 'Report to Developer.');
      }
    } catch (error: any) {
      console.error('[BackupData] Sync failed:', error);
      Alert.alert('Failed', 'Report to Developer.');
    }
  };

  const handleViewOutbox = async () => {
    try {
      const { getDatabase } = await import('@/lib/database/init');
      const db = await getDatabase();
      const rows = await db.getAllAsync(
        'SELECT * FROM sync_outbox ORDER BY created_at ASC'
      );
      setOutboxRows(rows);
      setShowOutboxModal(true);
    } catch (error) {
      console.error('[BackupData] Failed to load outbox:', error);
      Alert.alert('Error', 'Failed to load outbox');
    }
  };

  const handleClearOutbox = () => {
    if (user?.role !== 'developer' && user?.role !== 'boss' && user?.role !== 'boss2') {
      Alert.alert('Permission Denied', 'Only Developer and Boss can clear outbox');
      return;
    }

    Alert.alert(
      'Clear Outbox',
      'This will delete all pending sync items. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await SyncService.clearOutbox();
            await loadStatus();
            Alert.alert('Success', 'Outbox cleared');
          },
        },
      ]
    );
  };

  const handleSaveCredentials = async () => {
    const urlValidation = validateSupabaseUrl(editedUrl);
    const keyValidation = validateSupabaseKey(editedKey);

    if (!urlValidation.isValid) {
      Alert.alert('Invalid URL', urlValidation.reason);
      return;
    }

    if (!keyValidation.isValid) {
      Alert.alert('Invalid Key', keyValidation.reason);
      return;
    }

    try {
      await saveSupabaseCredentials(editedUrl, editedKey);
      setCurrentUrl(editedUrl);
      setCurrentKey(editedKey);
      setEditMode(false);
      await loadCredentials();
      Alert.alert('Success', 'Supabase credentials updated');
    } catch (error) {
      console.error('[BackupData] Failed to save credentials:', error);
      Alert.alert('Error', 'Failed to save credentials');
    }
  };

  const handleClearCredentials = () => {
    Alert.alert(
      'Clear Overrides',
      'This will reset to environment credentials. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearSupabaseCredentials();
              await loadCredentials();
              setEditMode(false);
              Alert.alert('Success', 'Credentials reset to environment values');
            } catch (error) {
              console.error('[BackupData] Failed to clear credentials:', error);
              Alert.alert('Error', 'Failed to clear credentials');
            }
          },
        },
      ]
    );
  };

  const urlValidation = validateSupabaseUrl(editedUrl);
  const keyValidation = validateSupabaseKey(editedKey);
  const currentUrlValidation = validateSupabaseUrl(currentUrl);
  const currentKeyValidation = validateSupabaseKey(currentKey);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Backup Data' }} />

      <ScrollView style={styles.content}>
        <View style={[styles.statusCard, { backgroundColor: theme.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Credentials</Text>
            <TouchableOpacity onPress={() => {
              setEditMode(!editMode);
              if (!editMode) {
                setEditedUrl(currentUrl);
                setEditedKey(currentKey);
              }
            }}>
              <Edit3 size={20} color={theme.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.credentialRow}>
            <View style={styles.credentialLeft}>
              <Text style={[styles.credentialLabel, { color: theme.textSecondary }]}>EXPO_PUBLIC_SUPABASE_URL</Text>
              <View style={styles.credentialInputContainer}>
                <TextInput
                  style={[styles.credentialInput, { color: theme.text, borderColor: theme.border }]}
                  value={editMode ? editedUrl : currentUrl}
                  onChangeText={setEditedUrl}
                  editable={editMode}
                  secureTextEntry={!showUrl}
                  placeholder="https://xxx.supabase.co"
                  placeholderTextColor={theme.textSecondary}
                />
                <TouchableOpacity onPress={() => setShowUrl(!showUrl)} style={styles.eyeIcon}>
                  {showUrl ? <EyeOff size={18} color={theme.textSecondary} /> : <Eye size={18} color={theme.textSecondary} />}
                </TouchableOpacity>
              </View>
            </View>
            {currentUrlValidation.isValid ? (
              <CheckCircle size={20} color={theme.success} />
            ) : (
              <XIcon size={20} color={theme.error} />
            )}
          </View>

          <View style={styles.credentialRow}>
            <View style={styles.credentialLeft}>
              <Text style={[styles.credentialLabel, { color: theme.textSecondary }]}>EXPO_PUBLIC_SUPABASE_ANON_KEY</Text>
              <View style={styles.credentialInputContainer}>
                <TextInput
                  style={[styles.credentialInput, { color: theme.text, borderColor: theme.border }]}
                  value={editMode ? editedKey : currentKey}
                  onChangeText={setEditedKey}
                  editable={editMode}
                  secureTextEntry={!showKey}
                  placeholder="eyJ..."
                  placeholderTextColor={theme.textSecondary}
                />
                <TouchableOpacity onPress={() => setShowKey(!showKey)} style={styles.eyeIcon}>
                  {showKey ? <EyeOff size={18} color={theme.textSecondary} /> : <Eye size={18} color={theme.textSecondary} />}
                </TouchableOpacity>
              </View>
            </View>
            {currentKeyValidation.isValid ? (
              <CheckCircle size={20} color={theme.success} />
            ) : (
              <XIcon size={20} color={theme.error} />
            )}
          </View>

          {editMode && (
            <View style={styles.credentialActions}>
              <TouchableOpacity
                style={[styles.credentialButton, { backgroundColor: theme.primary }]}
                onPress={handleSaveCredentials}
                disabled={!urlValidation.isValid || !keyValidation.isValid}
              >
                <Save size={18} color="#FFF" />
                <Text style={styles.credentialButtonText}>Save Credentials</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.credentialButtonOutline, { borderColor: theme.error }]}
                onPress={handleClearCredentials}
              >
                <Text style={[styles.credentialButtonTextOutline, { color: theme.error }]}>Clear Overrides</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={[styles.statusCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Status</Text>
          
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <Database size={20} color={theme.text} />
              <Text style={[styles.statusLabel, { color: theme.text }]}>Credentials</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: credentialsLoaded ? theme.success : theme.error }]}>
              <Text style={styles.badgeText}>{credentialsLoaded ? 'Valid' : 'Invalid'}</Text>
            </View>
          </View>

          {syncStatus?.lastSyncAt && (
            <View style={styles.statusRow}>
              <View style={styles.statusLeft}>
                <CheckCircle size={20} color={theme.success} />
                <Text style={[styles.statusLabel, { color: theme.text }]}>Last Sync</Text>
              </View>
              <Text style={[styles.statusValue, { color: theme.textSecondary, fontSize: 12 }]}>
                {new Date(syncStatus.lastSyncAt).toLocaleString()}
              </Text>
            </View>
          )}

          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <RefreshCw size={20} color={theme.text} />
              <Text style={[styles.statusLabel, { color: theme.text }]}>Pending Changes</Text>
            </View>
            <Text style={[styles.statusValue, { color: theme.textSecondary }]}>
              {syncStatus?.pendingCount || 0}
            </Text>
          </View>

          {syncStatus?.lastError && (
            <View style={[styles.errorBox, { backgroundColor: theme.background, borderColor: theme.error }]}>
              <AlertTriangle size={20} color={theme.error} />
              <View style={styles.errorTextContainer}>
                <Text style={[styles.errorTitle, { color: theme.error }]}>Last Error</Text>
                <Text style={[styles.errorText, { color: theme.textSecondary }]}>{syncStatus.lastError}</Text>
              </View>
            </View>
          )}
        </View>

        {!credentialsLoaded && (
          <View style={[styles.warningCard, { backgroundColor: theme.warning || '#F59E0B' }]}>
            <AlertTriangle size={20} color="#FFF" />
            <Text style={styles.warningText}>
              Supabase credentials are missing or invalid. Edit credentials above or set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable sync.
            </Text>
          </View>
        )}

        <View style={[styles.actionsCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Actions</Text>
          
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.primary }]}
            onPress={handleSyncNow}
            disabled={!credentialsLoaded || syncStatus?.isRunning}
          >
            {syncStatus?.isRunning ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <RefreshCw size={20} color="#FFF" />
                <Text style={styles.actionButtonText}>Run Sync Now</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButtonOutline, { borderColor: theme.border }]}
            onPress={handleViewOutbox}
          >
            <Database size={20} color={theme.text} />
            <Text style={[styles.actionButtonTextOutline, { color: theme.text }]}>View Outbox</Text>
          </TouchableOpacity>

          {(user?.role === 'developer' || user?.role === 'boss' || user?.role === 'boss2') && (
            <TouchableOpacity
              style={[styles.actionButtonOutline, { borderColor: theme.error }]}
              onPress={handleClearOutbox}
            >
              <Trash2 size={20} color={theme.error} />
              <Text style={[styles.actionButtonTextOutline, { color: theme.error }]}>Clear Outbox</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showProgressModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProgressModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Syncing…</Text>
              <TouchableOpacity onPress={() => setShowProgressModal(false)}>
                <XIcon size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {syncStatus?.isRunning ? (
                <>
                  <ActivityIndicator size="large" color={theme.primary} />
                  <Text style={[styles.progressText, { color: theme.text }]}>{syncStatus.currentStep}</Text>
                  {syncStatus.progress.total > 0 && (
                    <Text style={[styles.progressSubtext, { color: theme.textSecondary }]}>
                      {syncStatus.progress.current} / {syncStatus.progress.total}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <CheckCircle size={48} color={theme.success} />
                  <Text style={[styles.progressText, { color: theme.text }]}>{syncStatus?.currentStep || 'Ready'}</Text>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showOutboxModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOutboxModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Outbox ({outboxRows.length})</Text>
              <TouchableOpacity onPress={() => setShowOutboxModal(false)}>
                <XIcon size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.outboxList}>
              {outboxRows.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No pending items</Text>
              ) : (
                outboxRows.map((row: any) => (
                  <View key={row.id} style={[styles.outboxItem, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.outboxTable, { color: theme.text }]}>{row.table_name}</Text>
                    <Text style={[styles.outboxOp, { color: theme.textSecondary }]}>
                      {row.op.toUpperCase()} · Attempts: {row.attempts}
                    </Text>
                    <Text style={[styles.outboxDate, { color: theme.textSecondary, fontSize: 12 }]}>
                      {new Date(row.created_at).toLocaleString()}
                    </Text>
                    {row.last_error && (
                      <Text style={[styles.outboxError, { color: theme.error, fontSize: 12 }]} numberOfLines={2}>
                        {row.last_error}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statusCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  credentialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
  },
  credentialLeft: {
    flex: 1,
  },
  credentialLabel: {
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '500' as const,
  },
  credentialInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  credentialInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
  },
  credentialActions: {
    marginTop: 16,
    gap: 12,
  },
  credentialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  credentialButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  credentialButtonOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  credentialButtonTextOutline: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusLabel: {
    fontSize: 16,
  },
  statusValue: {
    fontSize: 16,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  errorBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    gap: 12,
  },
  errorTextContainer: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
  },
  warningCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    gap: 12,
    alignItems: 'center',
  },
  warningText: {
    flex: 1,
    color: '#FFF',
    fontSize: 14,
    lineHeight: 20,
  },
  actionsCard: {
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
    gap: 12,
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  actionButtonOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
    gap: 12,
    borderWidth: 1,
  },
  actionButtonTextOutline: {
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
    padding: 40,
    alignItems: 'center',
    gap: 16,
  },
  progressText: {
    fontSize: 16,
    textAlign: 'center',
  },
  progressSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  outboxList: {
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: 32,
  },
  outboxItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  outboxTable: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  outboxOp: {
    fontSize: 14,
    marginBottom: 4,
  },
  outboxDate: {
    marginBottom: 4,
  },
  outboxError: {
    marginTop: 4,
  },
});
