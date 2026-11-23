import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, gradients, radius, shadows, spacing, typography } from './tokens';
import { useAppTheme } from '@/features/theme/ThemeProvider';

type ButtonVariant = 'primary' | 'secondary' | 'light' | 'dark';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
}: ButtonProps) {
  const { theme } = useAppTheme();
  const isDisabled = disabled || loading;

  if (variant === 'secondary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={[styles.base, styles.secondary, theme === 'dark' && styles.secondaryDark, isDisabled && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.secondaryText}>{label}</Text>
        )}
      </Pressable>
    );
  }

  if (variant === 'light') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={[styles.base, styles.light, isDisabled && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color={colors.navy} />
        ) : (
          <Text style={styles.lightText}>{label}</Text>
        )}
      </Pressable>
    );
  }

  if (variant === 'dark') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={[styles.base, styles.dark, isDisabled && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <View style={styles.contentRow}>
            <Text style={styles.darkText}>{label}</Text>
            {icon ? <Ionicons name={icon} size={20} color={colors.primaryText} /> : null}
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} disabled={isDisabled} style={isDisabled && styles.disabled}>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.base}
      >
        {loading ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <View style={styles.contentRow}>
            <Text style={styles.primaryText}>{label}</Text>
            {icon ? <Ionicons name={icon} size={20} color={colors.primaryText} /> : null}
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryDark: { backgroundColor: '#182338', borderColor: '#465a78' },
  light: {
    backgroundColor: colors.surface,
  },
  dark: {
    backgroundColor: colors.navy,
    ...shadows.card,
  },
  disabled: {
    opacity: 0.5,
  },
  primaryText: {
    ...typography.subtitle,
    color: colors.primaryText,
  },
  secondaryText: {
    ...typography.subtitle,
    color: colors.text,
  },
  lightText: {
    ...typography.subtitle,
    color: colors.navy,
  },
  darkText: {
    ...typography.subtitle,
    color: colors.primaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
