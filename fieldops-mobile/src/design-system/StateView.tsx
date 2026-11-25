import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { colors, spacing, typography } from './tokens';
import { useThemeColors } from '@/features/theme/ThemeProvider';

type StateViewProps = {
  title: string;
  description?: string;
};

export function LoadingState({ title = 'Carregando...' }: Partial<StateViewProps>) {
  const themeColors = useThemeColors();
  return (
    <View style={styles.container}>
      <ActivityIndicator color={themeColors.primary} size="large" />
      <Text style={[styles.title, { color: themeColors.text }]}>{title}</Text>
    </View>
  );
}

export function EmptyState({ title, description }: StateViewProps) {
  const themeColors = useThemeColors();
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: themeColors.text }]}>{title}</Text>
      {description ? <Text style={[styles.description, { color: themeColors.textMuted }]}>{description}</Text> : null}
    </View>
  );
}

type ErrorStateProps = StateViewProps & {
  onRetry?: () => void;
};

export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  const themeColors = useThemeColors();
  return (
    <View style={styles.container}>
      <Text style={[styles.title, styles.errorTitle]}>{title}</Text>
      {description ? <Text style={[styles.description, { color: themeColors.textMuted }]}>{description}</Text> : null}
      {onRetry ? (
        <View style={styles.retryButton}>
          <Button label="Tentar novamente" onPress={onRetry} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  title: {
    ...typography.subtitle,
    textAlign: 'center',
  },
  errorTitle: {
    color: colors.danger,
  },
  description: {
    ...typography.body,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.sm,
  },
});
