import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

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

type ThemeContextValue = { theme: AppTheme; colors: ThemeColors };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const theme: AppTheme = colorScheme === 'dark' ? 'dark' : 'light';
  const value = useMemo(() => ({ theme, colors: theme === 'dark' ? darkColors : lightColors }), [theme]);
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
