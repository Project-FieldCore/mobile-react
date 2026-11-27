export const colors = {
  background: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF1F6',

  navy: '#152A4E',
  navyDark: '#0D1B33',
  navyLight: '#24457C',

  green: '#4C9F38',
  greenLight: '#7CC342',

  primary: '#152A4E',
  primaryText: '#FFFFFF',
  accent: '#4C9F38',
  accentText: '#FFFFFF',

  text: '#101828',
  textMuted: '#64748B',
  textOnDark: '#F4F6FA',

  border: '#E2E8F0',
  danger: '#DC2626',
  success: '#4C9F38',
};

export const gradients = {
  brand: [colors.navy, colors.green] as const,
  brandSubtle: [colors.navyDark, colors.navy] as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
};

export const typography = {
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  subtitle: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
};

export const shadows = {
  card: {
    shadowColor: colors.navyDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
};
