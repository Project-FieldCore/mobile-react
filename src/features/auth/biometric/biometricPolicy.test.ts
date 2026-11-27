import { describe, expect, it } from 'vitest';

import {
  enableFailureMessage,
  MAX_FAILED_ATTEMPTS,
  nextUnlockStep,
  resolveAvailability,
  shouldLockOnLaunch,
  shouldShowBiometricLock,
  toBiometricOutcome,
} from './biometricPolicy';

describe('biometria — disponibilidade (PBI-0080)', () => {
  it('só disponibiliza em iOS/Android com hardware e biometria cadastrada', () => {
    expect(resolveAvailability({ platform: 'ios', hasHardware: true, isEnrolled: true })).toEqual({ available: true });
    expect(resolveAvailability({ platform: 'android', hasHardware: true, isEnrolled: true })).toEqual({ available: true });
  });

  it('degrada em web, sem hardware e sem biometria cadastrada', () => {
    expect(resolveAvailability({ platform: 'web', hasHardware: true, isEnrolled: true })).toEqual({
      available: false,
      reason: 'unsupported_platform',
    });
    expect(resolveAvailability({ platform: 'ios', hasHardware: false, isEnrolled: false })).toEqual({
      available: false,
      reason: 'no_hardware',
    });
    expect(resolveAvailability({ platform: 'android', hasHardware: true, isEnrolled: false })).toEqual({
      available: false,
      reason: 'not_enrolled',
    });
  });
});

describe('biometria — resultado nativo → desfecho', () => {
  it('mapeia sucesso, cancelamento, lockout, indisponível e falha', () => {
    expect(toBiometricOutcome({ success: true })).toEqual({ type: 'success' });
    for (const error of ['user_cancel', 'app_cancel', 'system_cancel', 'user_fallback']) {
      expect(toBiometricOutcome({ success: false, error })).toEqual({ type: 'cancelled' });
    }
    expect(toBiometricOutcome({ success: false, error: 'lockout' })).toEqual({ type: 'lockout' });
    expect(toBiometricOutcome({ success: false, error: 'not_enrolled' })).toEqual({
      type: 'unavailable',
      reason: 'not_enrolled',
    });
    expect(toBiometricOutcome({ success: false, error: 'not_available' })).toEqual({
      type: 'unavailable',
      reason: 'no_hardware',
    });
    for (const error of ['authentication_failed', 'unable_to_process', 'timeout', 'unknown']) {
      expect(toBiometricOutcome({ success: false, error })).toEqual({ type: 'failed' });
    }
  });
});

describe('biometria — regras do gate de reabertura', () => {
  it('sucesso libera e zera as falhas', () => {
    expect(nextUnlockStep(2, { type: 'success' })).toEqual({ decision: 'unlock', failedAttempts: 0, message: null });
  });

  it('cancelamento permite nova tentativa sem contar falha', () => {
    const step = nextUnlockStep(1, { type: 'cancelled' });
    expect(step.decision).toBe('retry');
    expect(step.failedAttempts).toBe(1);
    expect(step.message).toMatch(/cancelado/i);
  });

  it('falhas repetidas exigem senha ao atingir o limite', () => {
    let attempts = 0;
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i += 1) {
      const step = nextUnlockStep(attempts, { type: 'failed' });
      expect(step.decision).toBe('retry');
      attempts = step.failedAttempts;
    }
    const last = nextUnlockStep(attempts, { type: 'failed' });
    expect(last.decision).toBe('fallback');
    expect(last.message).toMatch(/senha/i);
  });

  it('lockout e indisponibilidade caem direto no login por senha', () => {
    expect(nextUnlockStep(0, { type: 'lockout' }).decision).toBe('fallback');
    const unavailable = nextUnlockStep(0, { type: 'unavailable', reason: 'not_enrolled' });
    expect(unavailable.decision).toBe('fallback');
    expect(unavailable.message).toMatch(/senha/i);
  });

  it('só bloqueia a reabertura com sessão local e opt-in ligado', () => {
    expect(shouldLockOnLaunch({ hasSession: true, enabled: true })).toBe(true);
    expect(shouldLockOnLaunch({ hasSession: true, enabled: false })).toBe(false);
    expect(shouldLockOnLaunch({ hasSession: false, enabled: true })).toBe(false);
  });

  it('exibe o bloqueio apenas em rota protegida autenticada e travada', () => {
    const base = { requiresAuthentication: true, authStatus: 'authenticated' as const, locked: true };
    expect(shouldShowBiometricLock(base)).toBe(true);
    expect(shouldShowBiometricLock({ ...base, locked: false })).toBe(false);
    expect(shouldShowBiometricLock({ ...base, authStatus: 'unauthenticated' })).toBe(false);
    expect(shouldShowBiometricLock({ ...base, authStatus: 'loading' })).toBe(false);
    expect(shouldShowBiometricLock({ ...base, requiresAuthentication: false })).toBe(false);
  });

  it('mensagens de ativação não expõem códigos técnicos', () => {
    expect(enableFailureMessage({ type: 'cancelled' })).toMatch(/desligada/);
    expect(enableFailureMessage({ type: 'unavailable', reason: 'no_hardware' })).toMatch(/leitor biométrico/);
  });
});
