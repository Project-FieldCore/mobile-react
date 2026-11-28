export type AppTheme = 'light' | 'dark';
export type ThemePreference = AppTheme | 'system';

export const THEME_STORAGE_KEY = 'fieldops-theme';

export const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Sistema' },
];

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function resolveTheme(preference: ThemePreference, systemTheme: AppTheme): AppTheme {
  return preference === 'system' ? systemTheme : preference;
}
