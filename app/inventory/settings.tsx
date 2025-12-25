import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
  Animated,
} from 'react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { Eye, EyeOff, Lock } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { UserPreferencesRepository, type UserPreferences } from '@/lib/repositories/user-preferences.repository';

type ColorOption = { name: string; value: string };

const COLOR_PALETTE: ColorOption[] = [
  { name: 'Gray', value: '#F5F5F5' },
  { name: 'Blue', value: '#E3F2FD' },
  { name: 'Green', value: '#E8F5E9' },
  { name: 'Orange', value: '#FFF3E0' },
  { name: 'Pink', value: '#FCE4EC' },
  { name: 'Purple', value: '#F3E5F5' },
];

const FOOD_EMOJIS = ['🍕', '🍔', '🍟', '🌭', '🍿', '🧇', '🥓', '🥚', '🥞', '🧈', '🍞', '🥐', '🥖', '🥨', '🥯', '🥪'];

export default function InventorySettingsScreen() {
  const { theme } = useTheme();
  const { user, changePin } = useAuth();

  const [currentPin, setCurrentPin] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [showCurrentPin, setShowCurrentPin] = useState<boolean>(false);
  const [showNewPin, setShowNewPin] = useState<boolean>(false);
  const [showConfirmPin, setShowConfirmPin] = useState<boolean>(false);

  const [, setPreferences] = useState<UserPreferences | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [selectedBgColor, setSelectedBgColor] = useState<string | null>(null);
  const [bgIntensity, setBgIntensity] = useState<'light' | 'medium' | 'high'>('medium');
  const [foodIconsEnabled, setFoodIconsEnabled] = useState<boolean>(false);
  const [foodIconsIntensity, setFoodIconsIntensity] = useState<'light' | 'medium' | 'high'>('medium');

  const [foodAnimations, setFoodAnimations] = useState<{ id: number; emoji: string; x: Animated.Value; y: Animated.Value; opacity: Animated.Value; startY: number }[]>([]);

  const prefsRepo = useMemo(() => new UserPreferencesRepository(), []);

  const loadPreferences = useCallback(async () => {
    if (!user?.id) return;
    try {
      const prefs = await prefsRepo.getOrCreate(user.id);
      setPreferences(prefs);
      setIsDarkMode(prefs.dark_mode === 1);
      setSelectedBgColor(prefs.light_bg_color);
      setBgIntensity(prefs.light_bg_intensity);
      setFoodIconsEnabled(prefs.food_icons_enabled === 1);
      setFoodIconsIntensity(prefs.food_icons_intensity);
    } catch (error) {
      console.error('[Settings] Load preferences error:', error);
    }
  }, [user?.id, prefsRepo]);

  useFocusEffect(
    useCallback(() => {
      loadPreferences();
    }, [loadPreferences])
  );

  useEffect(() => {
    if (foodIconsEnabled) {
      const iconCounts = { light: 5, medium: 10, high: 15 };
      const count = iconCounts[foodIconsIntensity];
      
      const animations = Array.from({ length: count }, (_, i) => {
        const startY = Math.random() * 600;
        const x = new Animated.Value(Math.random() * 300);
        const y = new Animated.Value(startY);
        const opacity = new Animated.Value(0);
        
        return { id: i, emoji: FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)], x, y, opacity, startY };
      });

      setFoodAnimations(animations);

      animations.forEach((anim, index) => {
        Animated.loop(
          Animated.sequence([
            Animated.delay(index * 200),
            Animated.parallel([
              Animated.timing(anim.opacity, {
                toValue: foodIconsIntensity === 'light' ? 0.2 : foodIconsIntensity === 'medium' ? 0.4 : 0.6,
                duration: 1000,
                useNativeDriver: true,
              }),
              Animated.timing(anim.y, {
                toValue: anim.startY - 100,
                duration: 8000,
                useNativeDriver: true,
              }),
            ]),
            Animated.timing(anim.opacity, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        ).start();
      });
    } else {
      setFoodAnimations([]);
    }
  }, [foodIconsEnabled, foodIconsIntensity]);

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

  const handleSavePreferences = async () => {
    if (!user?.id) return;
    try {
      await prefsRepo.upsert(
        {
          user_id: user.id,
          dark_mode: isDarkMode ? 1 : 0,
          light_bg_color: selectedBgColor,
          light_bg_intensity: bgIntensity,
          food_icons_enabled: foodIconsEnabled ? 1 : 0,
          food_icons_intensity: foodIconsIntensity,
        },
        user.id
      );
      Alert.alert('Success', 'Preferences saved');
      await loadPreferences();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save preferences');
    }
  };

  const getBackgroundStyle = () => {
    if (isDarkMode || !selectedBgColor) {
      return { backgroundColor: theme.background };
    }
    
    const intensityOpacity = { light: 0.3, medium: 0.6, high: 0.9 };
    const opacity = intensityOpacity[bgIntensity];
    
    return {
      backgroundColor: theme.background,
      ...(selectedBgColor && { backgroundColor: selectedBgColor + Math.round(opacity * 255).toString(16).padStart(2, '0') }),
    };
  };

  return (
    <View style={[styles.container, getBackgroundStyle()]}>
      {foodAnimations.map((anim) => (
        <Animated.Text
          key={anim.id}
          style={[
            styles.foodIcon,
            {
              transform: [{ translateX: anim.x }, { translateY: anim.y }],
              opacity: anim.opacity,
            },
          ]}
        >
          {anim.emoji}
        </Animated.Text>
      ))}

      <ScrollView contentContainerStyle={styles.content}>
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
              value={isDarkMode}
              onValueChange={setIsDarkMode}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.preferenceRow, { opacity: isDarkMode ? 0.5 : 1 }]}>
            <Text style={[styles.preferenceLabel, { color: theme.text }]}>
              Background Color {isDarkMode && '(Light mode only)'}
            </Text>
          </View>
          <View style={styles.colorPalette}>
            {COLOR_PALETTE.map((color) => (
              <TouchableOpacity
                key={color.value}
                style={[
                  styles.colorOption,
                  { backgroundColor: color.value },
                  selectedBgColor === color.value && styles.colorOptionSelected,
                ]}
                onPress={() => !isDarkMode && setSelectedBgColor(color.value)}
                disabled={isDarkMode}
              >
                {selectedBgColor === color.value && (
                  <View style={[styles.colorCheckmark, { backgroundColor: theme.primary }]} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: theme.text, opacity: isDarkMode ? 0.5 : 1 }]}>
            Background Intensity
          </Text>
          <View style={styles.intensityRow}>
            {(['light', 'medium', 'high'] as const).map((intensity) => (
              <TouchableOpacity
                key={intensity}
                style={[
                  styles.intensityButton,
                  bgIntensity === intensity && { backgroundColor: theme.primary },
                  { borderColor: theme.border },
                ]}
                onPress={() => !isDarkMode && setBgIntensity(intensity)}
                disabled={isDarkMode}
              >
                <Text
                  style={[
                    styles.intensityButtonText,
                    { color: bgIntensity === intensity ? '#fff' : theme.text },
                  ]}
                >
                  {intensity.charAt(0).toUpperCase() + intensity.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.preferenceRow}>
            <Text style={[styles.preferenceLabel, { color: theme.text }]}>Animated Food Icons</Text>
            <Switch
              value={foodIconsEnabled}
              onValueChange={setFoodIconsEnabled}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor="#fff"
            />
          </View>

          <Text style={[styles.label, { color: theme.text }]}>Food Icons Intensity</Text>
          <View style={styles.intensityRow}>
            {(['light', 'medium', 'high'] as const).map((intensity) => (
              <TouchableOpacity
                key={intensity}
                style={[
                  styles.intensityButton,
                  foodIconsIntensity === intensity && { backgroundColor: theme.primary },
                  { borderColor: theme.border },
                ]}
                onPress={() => setFoodIconsIntensity(intensity)}
              >
                <Text
                  style={[
                    styles.intensityButtonText,
                    { color: foodIconsIntensity === intensity ? '#fff' : theme.text },
                  ]}
                >
                  {intensity.charAt(0).toUpperCase() + intensity.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: theme.success }]}
            onPress={handleSavePreferences}
          >
            <Text style={styles.saveButtonText}>Save Preferences</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
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
  colorPalette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  colorOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: '#333',
  },
  colorCheckmark: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  intensityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  intensityButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  intensityButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  saveButton: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  foodIcon: {
    position: 'absolute',
    fontSize: 24,
    zIndex: -1,
  },
});
