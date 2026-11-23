import { StyleSheet, View, ViewProps } from 'react-native';

import { colors, radius, shadows, spacing } from './tokens';
import { useAppTheme } from '@/features/theme/ThemeProvider';

export function Card({ style, children, ...viewProps }: ViewProps) {
  const { theme } = useAppTheme();
  return (
    <View style={[styles.card, theme === 'dark' && styles.darkCard, style]} {...viewProps}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    ...shadows.card,
  },
  darkCard: { backgroundColor: '#182338', borderColor: '#253650' },
});
