import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors, radius, spacing, typography } from './tokens';
import { useThemeColors } from '@/features/theme/ThemeProvider';

type TextFieldProps = TextInputProps & {
  label?: string;
  errorMessage?: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function TextField({
  label,
  errorMessage,
  icon,
  style,
  onFocus,
  onBlur,
  secureTextEntry,
  ...inputProps
}: TextFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const themeColors = useThemeColors();

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: themeColors.textMuted }]}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrapper,
          { backgroundColor: themeColors.surfaceMuted },
          isFocused && styles.inputWrapperFocused,
          isFocused && { borderColor: themeColors.navy, backgroundColor: themeColors.surface },
          errorMessage ? styles.inputWrapperError : null,
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={isFocused ? themeColors.navy : themeColors.textMuted}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          style={[styles.input, { color: themeColors.text }, style]}
          placeholderTextColor={themeColors.textMuted}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          {...inputProps}
          secureTextEntry={secureTextEntry && !isPasswordVisible}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
            hitSlop={8}
            onPress={() => setIsPasswordVisible((visible) => !visible)}
            style={styles.visibilityButton}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={isFocused ? themeColors.navy : themeColors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  inputWrapperFocused: {
  },
  inputWrapperError: {
    borderColor: colors.danger,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    ...typography.body,
    flex: 1,
    paddingVertical: spacing.md,
  },
  visibilityButton: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
  errorMessage: {
    ...typography.caption,
    color: colors.danger,
  },
});
