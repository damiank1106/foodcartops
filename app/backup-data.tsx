import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { X, Wifi, WifiOff, CheckCircle, AlertTriangle, RefreshCw, Trash2, Database } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import * as SyncService from '@/lib/services/sync.service';
import { SyncStatus } from '@/lib/services/sync.service';
import { isSyncEnabled } from '@/lib/supabase/client';

export default function BackupDataScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showOutboxModal, setShowOutboxModal] = useState(false);
  const [outboxRows, setOutboxRows] = useState<any[]>([]);

  useEffect(() => {
    loadStatus();
    const unsubscribe = SyncService.subscribeSyncStatus((status) => {
      setSyncStatus(status);
    });
    return unsubscribe;
  }, []);

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

  const credentialsLoaded = isSyncEnabled();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <X size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Backup Data</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={[styles.statusCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Status</Text>
          
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <Database size={20} color={theme.text} />
              <Text style={[styles.statusLabel, { color: theme.text }]}>Supabase Credentials</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: credentialsLoaded ? theme.success : theme.error }]}>
              <Text style={styles.badgeText}>{credentialsLoaded ? 'Loaded' : 'Missing'}</Text>
            </View>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              {syncStatus?.lastSyncAt ? <Wifi size={20} color={theme.success} /> : <WifiOff size={20} color={theme.textSecondary} />}
              <Text style={[styles.statusLabel, { color: theme.text }]}>Network</Text>
            </View>
            <Text style={[styles.statusValue, { color: theme.textSecondary }]}>
              {syncStatus?.isRunning ? 'Syncing...' : 'Online'}
            </Text>
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
              Supabase credentials are missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable sync.
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
              <Text style={[styles.modalTitle, { color: theme.text }]}>Building report…</Text>
              <TouchableOpacity onPress={() => setShowProgressModal(false)}>
                <X size={24} color={theme.text} />
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
                <X size={24} color={theme.text} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
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
  cardTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    marginBottom: 16,
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
