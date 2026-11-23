import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type AppTheme = 'light' | 'dark';

type ThemeContextValue = { theme: AppTheme; toggleTheme: () => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const KEY = 'fieldops.theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>('light');
  useEffect(() => { void readTheme().then((saved) => { if (saved) setTheme(saved); }); }, []);
  const value = useMemo(() => ({ theme, toggleTheme: () => { const next = theme === 'light' ? 'dark' : 'light'; setTheme(next); void writeTheme(next); } }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ThemeProvider ausente');
  return value;
}

async function readTheme(): Promise<AppTheme | null> {
  const value = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
  return value === 'dark' || value === 'light' ? value : null;
}
async function writeTheme(theme: AppTheme): Promise<void> {
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, theme);
  else await SecureStore.setItemAsync(KEY, theme);
}
