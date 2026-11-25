import { StyleSheet, View, ViewProps } from 'react-native';

import { radius, shadows, spacing } from './tokens';
import { useThemeColors } from '@/features/theme/ThemeProvider';

export function Card({ style, children, ...viewProps }: ViewProps) {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]} {...viewProps}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    ...shadows.card,
  },
});
