import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { AlertCircle, CheckCircle, RefreshCw } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { subscribeSyncStatus, syncNow, SyncStatus } from '@/lib/services/sync.service';
import { useToast } from '@/lib/contexts/toast.context';

interface SyncProgressModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onCancel?: () => void;
  reason: string;
  title?: string;
  allowCancel?: boolean;
}

export default function SyncProgressModal({
  visible,
  onClose,
  onSuccess,
  onCancel,
  reason,
  title = 'Synchronizing with Database',
  allowCancel = false,
}: SyncProgressModalProps) {
  const { theme } = useTheme();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const hasStartedSync = useRef<boolean>(false);
  const { showToast } = useToast();

  const startSync = useCallback(async () => {
    if (isSyncing || hasStartedSync.current) return;

    hasStartedSync.current = true;
    setIsSyncing(true);
    setError(null);
    setIsComplete(false);

    const result = await syncNow(reason);

    if (result.success) {
      setIsComplete(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } else {
      const errorMessage = result.error || 'Sync failed';
      if (
        errorMessage.toLowerCase().includes('internet') ||
        errorMessage.toLowerCase().includes('offline') ||
        errorMessage.toLowerCase().includes('supabase not configured')
      ) {
        showToast('Saved locally. Will sync when internet is available.', 'info');
        onSuccess();
        setIsSyncing(false);
        hasStartedSync.current = false;
        onClose();
        return;
      }

      setError(errorMessage);
      setIsSyncing(false);
      hasStartedSync.current = false;
    }
  }, [reason, onSuccess, onClose, isSyncing, showToast]);

  useEffect(() => {
    if (!visible) {
      setError(null);
      setIsComplete(false);
      setIsSyncing(false);
      hasStartedSync.current = false;
      return;
    }

    const unsubscribe = subscribeSyncStatus((status) => {
      setSyncStatus(status);
      if (status.lastError) {
        setError(status.lastError);
      }
    });

    startSync();

    return unsubscribe;
  }, [visible, startSync]);

  const handleRetry = () => {
    setError(null);
    hasStartedSync.current = false;
    startSync();
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (allowCancel && !isSyncing) {
          handleCancel();
        }
      }}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
          {isComplete ? (
            <>
              <View style={[styles.iconContainer, { backgroundColor: theme.success + '20' }]}>
                <CheckCircle size={48} color={theme.success} />
              </View>
              <Text style={[styles.title, { color: theme.text }]}>Success!</Text>
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                All Data has been saved.
              </Text>
            </>
          ) : error ? (
            <>
              <View style={[styles.iconContainer, { backgroundColor: theme.error + '20' }]}>
                <AlertCircle size={48} color={theme.error} />
              </View>
              <Text style={[styles.title, { color: theme.text }]}>Sync Failed</Text>
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                {error}
              </Text>
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.retryButton, { backgroundColor: theme.primary }]}
                  onPress={handleRetry}
                >
                  <RefreshCw size={20} color="#FFF" />
                  <Text style={styles.buttonText}>Try Again</Text>
                </TouchableOpacity>
                {allowCancel && (
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton, { backgroundColor: theme.background }]}
                    onPress={handleCancel}
                  >
                    <Text style={[styles.cancelButtonText, { color: theme.text }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : (
            <>
              <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
              <Text style={[styles.title, { color: theme.text }]}>Please wait</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                {title}
              </Text>

              {syncStatus && (
                <>
                  <View style={styles.statusContainer}>
                    <Text style={[styles.statusStep, { color: theme.text }]}>
                      {syncStatus.currentStep}
                    </Text>
                    {syncStatus.progress.total > 0 && (
                      <Text style={[styles.statusProgress, { color: theme.textSecondary }]}>
                        {syncStatus.progress.current} / {syncStatus.progress.total}
                        {syncStatus.progress.table && ` (${syncStatus.progress.table})`}
                      </Text>
                    )}
                    {syncStatus.pendingCount > 0 && (
                      <Text style={[styles.statusPending, { color: theme.textSecondary }]}>
                        Pending items: {syncStatus.pendingCount}
                      </Text>
                    )}
                  </View>

                  {syncStatus.progress.total > 0 && (
                    <View style={[styles.progressBar, { backgroundColor: theme.background }]}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            backgroundColor: theme.primary,
                            width: `${(syncStatus.progress.current / syncStatus.progress.total) * 100}%`,
                          },
                        ]}
                      />
                    </View>
                  )}
                </>
              )}
              <TouchableOpacity
                style={[styles.backgroundButton, { borderColor: theme.primary }]}
                onPress={onClose}
              >
                <Text style={[styles.backgroundButtonText, { color: theme.primary }]}>
                  Continue in background
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  statusContainer: {
    width: '100%',
    marginTop: 8,
    gap: 8,
  },
  statusStep: {
    fontSize: 14,
    fontWeight: '600' as const,
    textAlign: 'center',
  },
  statusProgress: {
    fontSize: 12,
    textAlign: 'center',
  },
  statusPending: {
    fontSize: 12,
    textAlign: 'center',
  },
  progressBar: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  backgroundButton: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backgroundButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  retryButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
