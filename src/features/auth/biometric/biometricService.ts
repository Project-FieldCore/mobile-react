import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

import {
  resolveAvailability,
  toBiometricOutcome,
  type BiometricAvailability,
  type BiometricOutcome,
} from './biometricPolicy';

const PROMPT_MESSAGE = 'Desbloqueie o FieldOps';

/** Verifica hardware + biometria cadastrada. Nunca lança: erro nativo = indisponível. */
export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return resolveAvailability({ platform: Platform.OS, hasHardware: false, isEnrolled: false });
  }
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return resolveAvailability({ platform: Platform.OS, hasHardware, isEnrolled });
  } catch {
    return { available: false, reason: 'no_hardware' };
  }
}

/**
 * Solicita a biometria do sistema. `disableDeviceFallback` evita cair no PIN do
 * aparelho: o fallback do FieldOps é o login por e-mail e senha.
 * Não recebe nem devolve credenciais/tokens.
 */
export async function authenticateWithBiometrics(): Promise<BiometricOutcome> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: PROMPT_MESSAGE,
      cancelLabel: 'Cancelar',
      fallbackLabel: '',
      disableDeviceFallback: true,
    });
    return toBiometricOutcome(result);
  } catch {
    return { type: 'failed' };
  }
}
