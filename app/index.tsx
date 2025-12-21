import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LogIn } from 'lucide-react-native';
import { useAuth } from '@/lib/contexts/auth.context';
import { useTheme } from '@/lib/contexts/theme.context';

export default function LoginScreen() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { loginWithPin, isLoading, user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading && user) {
      if (user.role === 'boss') {
        router.replace('/boss' as any);
      } else {
        router.replace('/worker' as any);
      }
    }
  }, [isLoading, user, router]);

  const addDigit = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        setTimeout(() => {
          handleLoginWithPin(newPin);
        }, 100);
      }
    }
  };

  const handleLoginWithPin = async (pinValue: string) => {
    setError('');
    setLoading(true);

    try {
      const success = await loginWithPin(pinValue);

      if (!success) {
        setError('Invalid PIN');
        setPin('');
      }
    } catch {
      setError('Login failed');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const deleteDigit = () => {
    setPin(pin.slice(0, -1));
    setError('');
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <LogIn size={48} color={theme.primary} />
            <Text style={[styles.title, { color: theme.text }]}>FoodCartOps</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              This app requires a mobile device
            </Text>
          </View>
          <View style={[styles.webNotice, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.webNoticeTitle, { color: theme.text }]}>Mobile Only</Text>
            <Text style={[styles.webNoticeText, { color: theme.textSecondary }]}>
              FoodCartOps is an Android app that uses SQLite for offline-first data storage.
              Please scan the QR code to run on a mobile device or emulator.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <LogIn size={48} color={theme.primary} />
          <Text style={[styles.title, { color: theme.text }]}>FoodCartOps</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Enter your PIN to continue
          </Text>
        </View>

        <View style={styles.pinContainer}>
          <View style={styles.pinDots}>
            {[0, 1, 2, 3].map((index) => (
              <View
                key={index}
                style={[
                  styles.pinDot,
                  { borderColor: theme.border },
                  index < pin.length && { backgroundColor: theme.primary },
                ]}
              />
            ))}
          </View>

          {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
        </View>

        <View style={styles.keypad}>
          {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', '⌫']].map(
            (row, rowIndex) => (
              <View key={rowIndex} style={styles.keypadRow}>
                {row.map((key) => {
                  if (!key) {
                    return <View key="empty" style={styles.keypadButton} />;
                  }

                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.keypadButton, { backgroundColor: theme.card }]}
                      onPress={() => (key === '⌫' ? deleteDigit() : addDigit(key))}
                      disabled={loading}
                    >
                      <Text style={[styles.keypadText, { color: theme.text }]}>{key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )
          )}
        </View>

        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Demo PINs: 0000 (Boss) • 1111, 2222, 3333 (Workers)
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '700' as const,
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  pinContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  pinDots: {
    flexDirection: 'row',
    gap: 16,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  error: {
    marginTop: 16,
    fontSize: 14,
  },
  keypad: {
    width: '100%',
    maxWidth: 320,
    gap: 12,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 12,
  },
  keypadButton: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  keypadText: {
    fontSize: 28,
    fontWeight: '600' as const,
  },
  hint: {
    marginTop: 32,
    fontSize: 12,
    textAlign: 'center',
  },
  webNotice: {
    marginTop: 32,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: 400,
  },
  webNoticeTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    marginBottom: 8,
    textAlign: 'center',
  },
  webNoticeText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
