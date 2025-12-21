import { useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';

const THEME_KEY = 'foodcartops_theme';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface Theme {
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  primaryDark: string;
  success: string;
  warning: string;
  error: string;
  overlay: string;
  tabBar: string;
  shadow: string;
}

const lightTheme: Theme = {
  background: '#F5F5F7',
  card: '#FFFFFF',
  text: '#1C1C1E',
  textSecondary: '#8E8E93',
  border: '#E5E5EA',
  primary: '#007AFF',
  primaryDark: '#0051D5',
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  overlay: 'rgba(0, 0, 0, 0.4)',
  tabBar: '#F9F9F9',
  shadow: 'rgba(0, 0, 0, 0.1)',
};

const darkTheme: Theme = {
  background: '#000000',
  card: '#1C1C1E',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  border: '#38383A',
  primary: '#0A84FF',
  primaryDark: '#0A84FF',
  success: '#32D74B',
  warning: '#FF9F0A',
  error: '#FF453A',
  overlay: 'rgba(0, 0, 0, 0.7)',
  tabBar: '#1C1C1E',
  shadow: 'rgba(0, 0, 0, 0.3)',
};

export const [ThemeProvider, useTheme] = createContextHook(() => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('auto');

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const stored = await AsyncStorage.getItem(THEME_KEY);
      if (stored) {
        setThemeModeState(stored as ThemeMode);
      }
    } catch (error) {
      console.error('[Theme] Failed to load theme:', error);
    }
  };

  const setThemeMode = async (mode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_KEY, mode);
      setThemeModeState(mode);
    } catch (error) {
      console.error('[Theme] Failed to save theme:', error);
    }
  };

  const isDark =
    themeMode === 'dark' || (themeMode === 'auto' && systemColorScheme === 'dark');

  const theme = isDark ? darkTheme : lightTheme;

  return {
    theme,
    themeMode,
    setThemeMode,
    isDark,
  };
});
