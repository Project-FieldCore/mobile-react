import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import {
  BrandLogo,
  Button,
  colors,
  gradients,
  spacing,
  TextField,
  typography,
} from '@/design-system';
import { ApiError } from '@/infrastructure/api/client';
import { useAuthStore } from '@/features/auth/store';
import { useThemeColors } from '@/features/theme/ThemeProvider';
import { ThemeSelector } from '@/features/theme/ThemeSelector';

const loginSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const themeColors = useThemeColors();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const signIn = useAuthStore((state) => state.signIn);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginForm>({ defaultValues: { email: '', password: '' } });

  const onSubmit = async (values: LoginForm) => {
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email' || field === 'password') {
          setError(field, { message: issue.message });
        }
      }
      return;
    }

    setErrorMessage(null);
    try {
      await signIn(parsed.data.email, parsed.data.password);
      router.replace('/home');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setErrorMessage('E-mail ou senha inválidos. Verifique seus dados e tente novamente.');
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setErrorMessage('Não foi possível acessar sua conta. Procure o administrador responsável.');
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível entrar. Tente novamente.',
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <BrandLogo width={230} />
      </LinearGradient>

        <View style={[styles.card, { backgroundColor: themeColors.background }]}>
          <Text style={[styles.greeting, { color: themeColors.text }]}>Olá!</Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>Entre com suas credenciais para continuar</Text>
          <View style={styles.themeSection}>
            <Text style={[styles.themeLabel, { color: themeColors.textMuted }]}>Aparência</Text>
            <ThemeSelector />
          </View>

          {errorMessage ? (
            <View style={[styles.errorBanner, { backgroundColor: themeColors.surfaceMuted }]}>
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  icon="mail-outline"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="E-mail"
                  errorMessage={errors.email?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  icon="lock-closed-outline"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry
                  autoComplete="current-password"
                  placeholder="Senha"
                  errorMessage={errors.password?.message}
                />
              )}
            />

            <Text
              style={[styles.forgotPasswordLink, { color: themeColors.primary }]}
              onPress={() => router.push('/forgot-password')}
            >
              Esqueceu a senha?
            </Text>

            <Button label="Entrar" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
          </View>

          <Text style={[styles.backLink, { color: themeColors.textMuted }]} onPress={() => router.back()}>
            Voltar
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { flexGrow: 1 },
  card: {
    marginTop: -32,
    backgroundColor: colors.surface,
    borderRadius: 32,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  greeting: {
    ...typography.title,
    color: colors.navy,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  themeSection: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  themeLabel: {
    ...typography.caption,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: '#FDECEC',
    borderRadius: 12,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
  },
  form: {
    gap: spacing.md,
  },
  forgotPasswordLink: {
    ...typography.caption,
    color: colors.navy,
    textAlign: 'right',
  },
  backLink: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
});
