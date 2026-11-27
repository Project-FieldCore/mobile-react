/**
 * Regras puras da biometria para reabertura local (PBI-0080).
 *
 * A biometria é apenas um gate LOCAL sobre uma sessão já autenticada no servidor
 * (PBI-0008): não substitui o login, não guarda senha e não toca em tokens.
 * Sem dependência de React Native/Expo para ser testável em Node.
 */

/** Falhas de biometria toleradas antes de exigir login por senha. */
export const MAX_FAILED_ATTEMPTS = 3;

export type BiometricUnavailableReason = 'unsupported_platform' | 'no_hardware' | 'not_enrolled';

export type BiometricAvailability =
  | { available: true }
  | { available: false; reason: BiometricUnavailableReason };

export function resolveAvailability(input: {
  platform: string;
  hasHardware: boolean;
  isEnrolled: boolean;
}): BiometricAvailability {
  if (input.platform !== 'ios' && input.platform !== 'android') {
    return { available: false, reason: 'unsupported_platform' };
  }
  if (!input.hasHardware) return { available: false, reason: 'no_hardware' };
  if (!input.isEnrolled) return { available: false, reason: 'not_enrolled' };
  return { available: true };
}

export function unavailableMessage(reason: BiometricUnavailableReason): string {
  switch (reason) {
    case 'unsupported_platform':
      return 'A biometria não está disponível neste ambiente.';
    case 'no_hardware':
      return 'Este aparelho não possui leitor biométrico.';
    case 'not_enrolled':
      return 'Cadastre uma digital ou rosto nas configurações do aparelho para usar a biometria.';
  }
}

export type BiometricOutcome =
  | { type: 'success' }
  | { type: 'cancelled' }
  | { type: 'failed' }
  | { type: 'lockout' }
  | { type: 'unavailable'; reason: BiometricUnavailableReason };

/** Subconjunto do `LocalAuthenticationResult` do expo-local-authentication. */
export type NativeAuthResult = { success: true } | { success: false; error: string };

/** Traduz o resultado nativo em um desfecho de domínio (sem vazar códigos do SO para a UI). */
export function toBiometricOutcome(result: NativeAuthResult): BiometricOutcome {
  if (result.success) return { type: 'success' };
  switch (result.error) {
    case 'user_cancel':
    case 'app_cancel':
    case 'system_cancel':
    case 'user_fallback':
      return { type: 'cancelled' };
    case 'lockout':
      return { type: 'lockout' };
    case 'not_enrolled':
    case 'passcode_not_set':
      return { type: 'unavailable', reason: 'not_enrolled' };
    case 'not_available':
      return { type: 'unavailable', reason: 'no_hardware' };
    default:
      return { type: 'failed' };
  }
}

export type UnlockDecision = 'unlock' | 'retry' | 'fallback';

export type UnlockStep = {
  decision: UnlockDecision;
  failedAttempts: number;
  message: string | null;
};

/**
 * Decide o próximo passo do desbloqueio.
 * - sucesso → libera e zera falhas;
 * - cancelamento → permite nova tentativa sem contar como falha;
 * - falha → conta; ao atingir o limite exige senha;
 * - lockout/indisponível → exige senha imediatamente.
 */
export function nextUnlockStep(failedAttempts: number, outcome: BiometricOutcome): UnlockStep {
  switch (outcome.type) {
    case 'success':
      return { decision: 'unlock', failedAttempts: 0, message: null };
    case 'cancelled':
      return {
        decision: 'retry',
        failedAttempts,
        message: 'Desbloqueio cancelado. Tente novamente ou entre com a senha.',
      };
    case 'failed': {
      const attempts = failedAttempts + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        return {
          decision: 'fallback',
          failedAttempts: attempts,
          message: 'Muitas tentativas sem sucesso. Entre com e-mail e senha para continuar.',
        };
      }
      return {
        decision: 'retry',
        failedAttempts: attempts,
        message: 'Não foi possível reconhecer a biometria. Tente novamente.',
      };
    }
    case 'lockout':
      return {
        decision: 'fallback',
        failedAttempts,
        message: 'Biometria bloqueada temporariamente pelo aparelho. Entre com e-mail e senha para continuar.',
      };
    case 'unavailable':
      return {
        decision: 'fallback',
        failedAttempts,
        message: `${unavailableMessage(outcome.reason)} Entre com e-mail e senha para continuar.`,
      };
  }
}

/** Mensagem para a ativação (Perfil/Início) — falhas aqui não derrubam a sessão. */
export function enableFailureMessage(outcome: BiometricOutcome): string {
  switch (outcome.type) {
    case 'success':
      return '';
    case 'cancelled':
      return 'Ativação cancelada. A biometria continua desligada.';
    case 'failed':
      return 'Não foi possível confirmar a biometria. Tente novamente.';
    case 'lockout':
      return 'Biometria bloqueada temporariamente pelo aparelho. Tente mais tarde.';
    case 'unavailable':
      return unavailableMessage(outcome.reason);
  }
}

/** Bloqueia ao reabrir apenas quando há sessão local válida E o usuário optou pelo gate. */
export function shouldLockOnLaunch(input: { hasSession: boolean; enabled: boolean }): boolean {
  return input.hasSession && input.enabled;
}

/** O gate só cobre rotas protegidas com sessão autenticada. */
export function shouldShowBiometricLock(input: {
  requiresAuthentication: boolean;
  authStatus: 'loading' | 'authenticated' | 'unauthenticated';
  locked: boolean;
}): boolean {
  return input.requiresAuthentication && input.authStatus === 'authenticated' && input.locked;
}
