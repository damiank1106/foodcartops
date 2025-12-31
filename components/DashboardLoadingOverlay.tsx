import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { format } from 'date-fns';
import { Loader2, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';

interface DashboardLoadingOverlayProps {
  visible: boolean;
  currentStep: string;
  progress?: {
    current: number;
    total: number;
    table?: string;
  };
  pendingCount?: number;
  lastSyncAt?: string | null;
  lastError?: string | null;
  onClose?: () => void;
}

export default function DashboardLoadingOverlay({
  visible,
  currentStep,
  progress,
  pendingCount = 0,
  lastSyncAt,
  lastError,
  onClose,
}: DashboardLoadingOverlayProps) {
  const { theme } = useTheme();
  const [showStillWorking, setShowStillWorking] = useState(false);
  const spinValue = useState(new Animated.Value(0))[0];

  useEffect(() => {
    if (visible) {
      setShowStillWorking(false);
      
      const timer = setTimeout(() => {
        setShowStillWorking(true);
      }, 10000);

      const spin = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spin.start();

      return () => {
        clearTimeout(timer);
        spin.stop();
      };
    } else {
      setShowStillWorking(false);
      spinValue.setValue(0);
    }
  }, [visible, spinValue]);

  const spinRotation = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (!visible) return null;

  const hasError = !!lastError;
  const showProgress = progress && progress.total > 0;
  const progressPercent = showProgress
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <BlurView intensity={80} style={styles.overlay}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            {hasError ? (
              <>
                <View style={[styles.iconContainer, { backgroundColor: theme.error + '20' }]}>
                  <AlertCircle size={48} color={theme.error} />
                </View>

                <Text style={[styles.title, { color: theme.text }]}>Error</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  {lastError}
                </Text>

                {onClose && (
                  <TouchableOpacity
                    style={[styles.closeButton, { backgroundColor: theme.primary }]}
                    onPress={onClose}
                  >
                    <Text style={styles.closeButtonText}>Close</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
                  <Animated.View style={{ transform: [{ rotate: spinRotation }] }}>
                    <Loader2 size={48} color={theme.primary} />
                  </Animated.View>
                </View>

                <Text style={[styles.title, { color: theme.text }]}>Please wait…</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  Updating database…
                </Text>

                {showStillWorking && (
                  <Text style={[styles.stillWorking, { color: theme.warning }]}>
                    Still working…
                  </Text>
                )}

                <View style={[styles.detailsContainer, { backgroundColor: theme.background }]}>
                  {currentStep && currentStep !== 'idle' && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                        Status:
                      </Text>
                      <Text
                        style={[styles.detailValue, { color: theme.primary }]}
                        numberOfLines={2}
                      >
                        {currentStep}
                      </Text>
                    </View>
                  )}

                  {showProgress && (
                    <>
                      <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                          Progress:
                        </Text>
                        <Text style={[styles.detailValue, { color: theme.text }]}>
                          {progress.current} / {progress.total} ({progressPercent}%)
                        </Text>
                      </View>

                      <View style={[styles.progressBarContainer, { backgroundColor: theme.border }]}>
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              backgroundColor: theme.primary,
                              width: `${progressPercent}%`,
                            },
                          ]}
                        />
                      </View>

                      {progress.table && (
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                            Table:
                          </Text>
                          <Text style={[styles.detailValue, { color: theme.text }]}>
                            {progress.table}
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  {pendingCount > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                        Pending:
                      </Text>
                      <Text style={[styles.detailValue, { color: theme.warning }]}>
                        {pendingCount}
                      </Text>
                    </View>
                  )}

                  {lastSyncAt && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                        Last Sync:
                      </Text>
                      <Text style={[styles.detailValue, { color: theme.textSecondary }]}>
                        {format(new Date(lastSyncAt), 'h:mm a')}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  stillWorking: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  detailsContainer: {
    width: '100%',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 0.4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 0.6,
    textAlign: 'right',
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  closeButton: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
