import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { colors as lightColors } from '@/design-system/tokens';
import {
  normalizeThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type AppTheme,
  type ThemePreference,
} from './theme';

export type { AppTheme, ThemePreference } from './theme';

export type ThemeColors = typeof lightColors;

const darkColors: ThemeColors = {
  ...lightColors,
  background: '#0D1626',
  surface: '#182338',
  surfaceMuted: '#253650',
  primary: '#D9E4F5',
  text: '#F4F7FB',
  textMuted: '#AAB9CE',
  border: '#465A78',
  // Dark-theme interactive blue: it retains the brand cue without losing contrast
  // against the dark surfaces used by chips, tabs and status indicators.
  navy: '#2E5D96',
  navyDark: '#09101D',
  navyLight: '#AAB9CE',
};

type ThemeContextValue = {
  theme: AppTheme;
  preference: ThemePreference;
  colors: ThemeColors;
  setTheme: (preference: ThemePreference) => void;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const systemTheme: AppTheme = colorScheme === 'dark' ? 'dark' : 'light';
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(THEME_STORAGE_KEY)
      .then((stored) => {
        if (active) setPreference(normalizeThemePreference(stored));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
    void SecureStore.setItemAsync(THEME_STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const theme = resolveTheme(preference, systemTheme);
  const value = useMemo(
    () => ({ theme, preference, colors: theme === 'dark' ? darkColors : lightColors, setTheme }),
    [preference, setTheme, theme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ThemeProvider ausente');
  return value;
}

export function useThemeColors(): ThemeColors {
  return useAppTheme().colors;
}
