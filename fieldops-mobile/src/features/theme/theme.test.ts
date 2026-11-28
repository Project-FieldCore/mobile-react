import { describe, expect, it } from 'vitest';

import { normalizeThemePreference, resolveTheme, THEME_OPTIONS } from './theme';

describe('tema do aplicativo', () => {
  it('aceita claro, escuro e sistema', () => {
    expect(THEME_OPTIONS.map((option) => option.value)).toEqual(['light', 'dark', 'system']);
    expect(normalizeThemePreference('light')).toBe('light');
    expect(normalizeThemePreference('dark')).toBe('dark');
    expect(normalizeThemePreference('system')).toBe('system');
  });

  it('usa sistema para valores ausentes ou inválidos', () => {
    expect(normalizeThemePreference(null)).toBe('system');
    expect(normalizeThemePreference('azul')).toBe('system');
  });

  it('respeita escolha explícita e resolve a preferência do sistema', () => {
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
  });
});
