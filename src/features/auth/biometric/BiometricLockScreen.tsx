import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, colors as brandColors, LoadingState, spacing, typography } from '@/design-system';
import { useAppTheme } from '@/features/theme/ThemeProvider';
import { useAuthStore } from '../store';
import { useBiometricGateStore } from './biometricGateStore';

/**
 * Tela exibida ao reabrir o app com sessão local válida e "Desbloquear com
 * biometria" ligado (PBI-0080). Estados: loading (prompt do sistema), erro
 * (cancelou/falhou, com nova tentativa) e fallback para o login por senha.
 */
export function BiometricLockScreen() {
  const { colors } = useAppTheme();
  const phase = useBiometricGateStore((state) => state.phase);
  const message = useBiometricGateStore((state) => state.message);
  const requiresPassword = useBiometricGateStore((state) => state.requiresPassword);
  const attemptUnlock = useBiometricGateStore((state) => state.attemptUnlock);
  const signOut = useAuthStore((state) => state.signOut);
  const [signingOut, setSigningOut] = useState(false);
  const autoPrompted = useRef(false);

  const unlock = useCallback(() => {
    void attemptUnlock();
  }, [attemptUnlock]);

  useEffect(() => {
    // Abre o prompt do sistema uma única vez ao montar.
    if (autoPrompted.current) return;
    autoPrompted.current = true;
    unlock();
  }, [unlock]);

  const fallbackToPassword = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  if (phase === 'authenticating' && !message) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LoadingState title="Aguardando biometria..." />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Ionicons name="finger-print-outline" size={56} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>FieldOps bloqueado</Text>
        <Text style={[styles.description, { color: colors.textMuted }]}>
          Use a biometria para continuar com a sessão deste aparelho.
        </Text>
        {message ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {message}
          </Text>
        ) : null}
        <View style={styles.actions}>
          {requiresPassword ? null : (
            <Button label="Usar biometria" onPress={unlock} />
          )}
          <Button
            label="Entrar com senha"
            variant="secondary"
            onPress={() => void fallbackToPassword()}
            loading={signingOut}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  title: { ...typography.title, textAlign: 'center' },
  description: { ...typography.body, textAlign: 'center' },
  error: { ...typography.body, color: brandColors.danger, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
});
