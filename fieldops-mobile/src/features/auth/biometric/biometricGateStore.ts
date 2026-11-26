import { create } from 'zustand';

import { authenticateWithBiometrics, getBiometricAvailability } from './biometricService';
import {
  clearBiometricUnlock,
  isBiometricUnlockEnabled,
  setBiometricUnlockEnabled,
} from './biometricPreference';
import {
  enableFailureMessage,
  nextUnlockStep,
  shouldLockOnLaunch,
  type UnlockDecision,
  unavailableMessage,
} from './biometricPolicy';

type BiometricGateState = {
  /** Preferência opt-in persistida em Secure Store (desligada por padrão). */
  enabled: boolean;
  /** `true` enquanto a reabertura aguarda a biometria. */
  locked: boolean;
  phase: 'idle' | 'authenticating';
  failedAttempts: number;
  /** Após falhas repetidas/lockout: só o login por senha libera o app. */
  requiresPassword: boolean;
  message: string | null;
  /** Chamado na hidratação, antes de liberar as rotas protegidas. */
  restoreOnLaunch: (hasSession: boolean) => Promise<void>;
  attemptUnlock: () => Promise<UnlockDecision>;
  enable: () => Promise<{ ok: true } | { ok: false; message: string }>;
  disable: () => Promise<void>;
  /** Logout/expiração/novo login: volta ao estado neutro (liberado, sem preferência). */
  reset: () => void;
};

const NEUTRAL = {
  enabled: false,
  locked: false,
  phase: 'idle' as const,
  failedAttempts: 0,
  requiresPassword: false,
  message: null,
};

export const useBiometricGateStore = create<BiometricGateState>((set, get) => ({
  ...NEUTRAL,
  restoreOnLaunch: async (hasSession) => {
    if (!hasSession) {
      // Sessão ausente/expirada: o desbloqueio local não deve sobreviver a ela.
      try {
        await clearBiometricUnlock();
      } catch {
        // Limpeza best-effort; o gate só é avaliado com sessão válida.
      }
      set({ ...NEUTRAL });
      return;
    }

    let enabled: boolean;
    try {
      enabled = await isBiometricUnlockEnabled();
    } catch {
      // Falha ao ler a preferência: fail-closed (exige biometria ou senha).
      enabled = true;
    }
    set({ ...NEUTRAL, enabled, locked: shouldLockOnLaunch({ hasSession, enabled }) });
  },
  attemptUnlock: async () => {
    const { phase, locked, requiresPassword, failedAttempts } = get();
    if (!locked || requiresPassword || phase === 'authenticating') return 'retry';

    set({ phase: 'authenticating', message: null });
    const outcome = await authenticateWithBiometrics();
    const step = nextUnlockStep(failedAttempts, outcome);

    set({
      phase: 'idle',
      failedAttempts: step.failedAttempts,
      message: step.message,
      locked: step.decision !== 'unlock',
      requiresPassword: step.decision === 'fallback',
    });
    return step.decision;
  },
  enable: async () => {
    if (get().phase === 'authenticating') return { ok: false, message: 'Aguarde a confirmação em andamento.' };

    const availability = await getBiometricAvailability();
    if (!availability.available) return { ok: false, message: unavailableMessage(availability.reason) };

    set({ phase: 'authenticating' });
    try {
      const outcome = await authenticateWithBiometrics();
      if (outcome.type !== 'success') return { ok: false, message: enableFailureMessage(outcome) };

      await setBiometricUnlockEnabled();
      set({ enabled: true });
      return { ok: true };
    } catch {
      return { ok: false, message: 'Não foi possível salvar a preferência. Tente novamente.' };
    } finally {
      set({ phase: 'idle' });
    }
  },
  disable: async () => {
    await clearBiometricUnlock();
    set({ ...NEUTRAL });
  },
  reset: () => set({ ...NEUTRAL }),
}));
