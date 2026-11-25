import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { colors as lightColors } from '@/design-system/tokens';

export type AppTheme = 'light' | 'dark';

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

type ThemeContextValue = { theme: AppTheme; toggleTheme: () => void; colors: ThemeColors };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const KEY = 'fieldops.theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>('light');
  useEffect(() => { void readTheme().then((saved) => { if (saved) setTheme(saved); }); }, []);
  const value = useMemo(() => ({
    theme,
    colors: theme === 'dark' ? darkColors : lightColors,
    toggleTheme: () => { const next = theme === 'light' ? 'dark' : 'light'; setTheme(next); void writeTheme(next); },
  }), [theme]);
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

async function readTheme(): Promise<AppTheme | null> {
  const value = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
  return value === 'dark' || value === 'light' ? value : null;
}
async function writeTheme(theme: AppTheme): Promise<void> {
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, theme);
  else await SecureStore.setItemAsync(KEY, theme);
}
