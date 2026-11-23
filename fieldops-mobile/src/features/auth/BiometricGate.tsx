import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import { Button, colors, spacing, typography } from '@/design-system';

type Props = { enabled: boolean; children: React.ReactNode };

export function BiometricGate({ enabled, children }: Props) {
  const appState = useRef(AppState.currentState);
  const [locked, setLocked] = useState(enabled);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const unlock = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const supported = await LocalAuthentication.hasHardwareAsync();
      const enrolled = supported && await LocalAuthentication.isEnrolledAsync();
      setAvailable(enrolled);
      if (!enrolled) {
        setLocked(false);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquear FieldCore',
        cancelLabel: 'Agora não',
        disableDeviceFallback: true,
        biometricsSecurityLevel: 'strong',
      });
      if (result.success) {
        setLocked(false);
      } else if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
        setMessage('Não foi possível validar sua biometria. Tente novamente.');
      }
    } catch {
      setMessage('Não foi possível validar sua biometria. Tente novamente.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (enabled) void unlock();
    else setLocked(false);
  }, [enabled]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const returning = /inactive|background/.test(appState.current ?? '') && nextState === 'active';
      appState.current = nextState;
      if (enabled && available !== false && returning) {
        setLocked(true);
        void unlock();
      }
    });
    return () => subscription.remove();
  }, [available, enabled]);

  if (!enabled || !locked) return <>{children}</>;

  return <View style={styles.container}>
    <Text style={styles.title}>Aplicativo bloqueado</Text>
    <Text style={styles.description}>{available === false ? 'A biometria não está cadastrada neste aparelho.' : 'Use sua biometria para reabrir o FieldCore.'}</Text>
    {message ? <Text style={styles.error}>{message}</Text> : null}
    <Button label={checking ? 'Validando…' : 'Desbloquear'} onPress={() => void unlock()} loading={checking} disabled={checking} />
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background },
  title: { ...typography.title, color: colors.text },
  description: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  error: { ...typography.caption, color: colors.danger },
});
