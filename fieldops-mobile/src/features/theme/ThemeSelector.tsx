import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography } from '@/design-system/tokens';
import { useAppTheme } from './ThemeProvider';
import { THEME_OPTIONS } from './theme';

export function ThemeSelector() {
  const { colors, preference, setTheme } = useAppTheme();

  return (
    <View
      accessibilityLabel="Tema da interface"
      style={[styles.container, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
    >
      {THEME_OPTIONS.map((option) => {
        const active = preference === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Usar tema ${option.label.toLowerCase()}`}
            onPress={() => setTheme(option.value)}
            style={[
              styles.option,
              active && { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.label, { color: active ? colors.text : colors.textMuted }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 3,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  label: {
    ...typography.caption,
    fontWeight: '700',
  },
});
