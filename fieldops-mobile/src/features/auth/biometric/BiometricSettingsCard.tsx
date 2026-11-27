import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors as brandColors, spacing, typography } from '@/design-system';
import { useAppTheme } from '@/features/theme/ThemeProvider';
import { useBiometricGateStore } from './biometricGateStore';
import { getBiometricAvailability } from './biometricService';
import { unavailableMessage, type BiometricAvailability } from './biometricPolicy';

type Feedback = { kind: 'success' | 'error'; text: string } | null;

/**
 * Preferência opt-in "Desbloquear com biometria" (PBI-0080). Desligada por
 * padrão; só liga após confirmar a biometria. Em web/simulador sem biometria
 * cadastrada o cartão fica desabilitado, explicando o motivo.
 */
export function BiometricSettingsCard() {
  const { theme, colors } = useAppTheme();
  const enabled = useBiometricGateStore((state) => state.enabled);
  const phase = useBiometricGateStore((state) => state.phase);
  const enable = useBiometricGateStore((state) => state.enable);
  const disable = useBiometricGateStore((state) => state.disable);
  const [availability, setAvailability] = useState<BiometricAvailability | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let active = true;
    void getBiometricAvailability().then((value) => {
      if (active) setAvailability(value);
    });
    return () => {
      active = false;
    };
  }, []);

  const toggle = useCallback(async () => {
    setFeedback(null);
    if (enabled) {
      try {
        await disable();
        setFeedback({ kind: 'success', text: 'Desbloqueio por biometria desativado.' });
      } catch {
        setFeedback({ kind: 'error', text: 'Não foi possível desativar a biometria. Tente novamente.' });
      }
      return;
    }
    const result = await enable();
    setFeedback(
      result.ok
        ? { kind: 'success', text: 'Desbloqueio por biometria ativado. Será pedido ao reabrir o app.' }
        : { kind: 'error', text: result.message },
    );
  }, [enabled, enable, disable]);

  const dark = theme === 'dark';
  const loading = availability === null;
  const unavailable = availability && !availability.available ? availability : null;
  // Quem já ativou pode sempre desativar, mesmo se a biometria sumiu do aparelho.
  const canToggle = !loading && (enabled || availability?.available === true);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="finger-print-outline" size={22} color={dark ? '#D9E4F5' : colors.navy} />
        <View style={styles.text}>
          <Text style={[styles.title, { color: colors.text }]}>Desbloquear com biometria</Text>
          <Text style={[styles.description, { color: colors.textMuted }]}>
            Peça a biometria ao reabrir o app. Não substitui o login e não guarda sua senha.
          </Text>
        </View>
      </View>
      {unavailable ? (
        <Text style={[styles.description, { color: colors.textMuted }]}>{unavailableMessage(unavailable.reason)}</Text>
      ) : null}
      <Button
        label={enabled ? 'Desativar biometria' : 'Ativar biometria'}
        variant="secondary"
        onPress={() => void toggle()}
        loading={loading || phase === 'authenticating'}
        disabled={!canToggle}
      />
      {feedback ? (
        <Text
          accessibilityRole={feedback.kind === 'error' ? 'alert' : undefined}
          style={[
            styles.description,
            { color: feedback.kind === 'error' ? brandColors.danger : brandColors.success },
          ]}
        >
          {feedback.text}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  text: { flex: 1, gap: 2 },
  title: { ...typography.subtitle },
  description: { ...typography.caption, lineHeight: 18 },
});
