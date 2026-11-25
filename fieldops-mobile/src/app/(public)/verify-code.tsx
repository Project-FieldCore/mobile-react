import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  BrandLogo,
  Button,
  colors,
  gradients,
  spacing,
  TextField,
  typography,
} from '@/design-system';

export default function VerifyCodeScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = () => {
    if (code.length !== 6) {
      setErrorMessage('Informe os 6 dígitos do código recebido por e-mail.');
      return;
    }

    setErrorMessage(null);
    // Validação real do código chega com a integração da API na Sprint 2.
    router.push({ pathname: '/reset-password', params: { email, code } });
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <BrandLogo width={230} />
      </LinearGradient>

        <View style={styles.card}>
          <Text style={styles.greeting}>Verifique seu e-mail</Text>
          <Text style={styles.subtitle}>
            Enviamos um código de 6 dígitos para{email ? ` ${email}` : ' o e-mail informado'}.
          </Text>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <TextField
              icon="key-outline"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="Código de 6 dígitos"
            />

            {/* Reenvio real chega com a integração da API na Sprint 2 */}
            <Text style={styles.resendLink}>Não recebeu? Reenviar código</Text>

            <Button label="Verificar código" onPress={handleSubmit} />
          </View>

          <Text style={styles.backLink} onPress={() => router.back()}>
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
  resendLink: {
    ...typography.caption,
    color: colors.navy,
    textAlign: 'center',
  },
  backLink: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
});
