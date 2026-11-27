import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBiometricGateStore } from './biometricGateStore';
import { authenticateWithBiometrics, getBiometricAvailability } from './biometricService';
import {
  clearBiometricUnlock,
  isBiometricUnlockEnabled,
  setBiometricUnlockEnabled,
} from './biometricPreference';

vi.mock('./biometricService', () => ({
  getBiometricAvailability: vi.fn(),
  authenticateWithBiometrics: vi.fn(),
}));

vi.mock('./biometricPreference', () => ({
  isBiometricUnlockEnabled: vi.fn(),
  setBiometricUnlockEnabled: vi.fn().mockResolvedValue(undefined),
  clearBiometricUnlock: vi.fn().mockResolvedValue(undefined),
}));

const mockedAuthenticate = vi.mocked(authenticateWithBiometrics);
const mockedAvailability = vi.mocked(getBiometricAvailability);
const mockedIsEnabled = vi.mocked(isBiometricUnlockEnabled);
const mockedSetEnabled = vi.mocked(setBiometricUnlockEnabled);
const mockedClear = vi.mocked(clearBiometricUnlock);

const gate = () => useBiometricGateStore.getState();

describe('gate de biometria na reabertura (PBI-0080)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gate().reset();
  });

  describe('restoreOnLaunch', () => {
    it('com sessão e opt-in ligado, bloqueia as rotas protegidas', async () => {
      mockedIsEnabled.mockResolvedValue(true);
      await gate().restoreOnLaunch(true);
      expect(gate().locked).toBe(true);
      expect(gate().enabled).toBe(true);
    });

    it('opt-in desligado (padrão) não bloqueia', async () => {
      mockedIsEnabled.mockResolvedValue(false);
      await gate().restoreOnLaunch(true);
      expect(gate().locked).toBe(false);
    });

    it('sem sessão/expirada limpa o desbloqueio e não bloqueia', async () => {
      await gate().restoreOnLaunch(false);
      expect(mockedClear).toHaveBeenCalled();
      expect(gate().locked).toBe(false);
      expect(gate().enabled).toBe(false);
    });

    it('falha ao ler a preferência bloqueia (fail-closed)', async () => {
      mockedIsEnabled.mockRejectedValue(new Error('secure store'));
      await gate().restoreOnLaunch(true);
      expect(gate().locked).toBe(true);
    });
  });

  describe('attemptUnlock', () => {
    beforeEach(async () => {
      mockedIsEnabled.mockResolvedValue(true);
      await gate().restoreOnLaunch(true);
    });

    it('sucesso libera as rotas', async () => {
      mockedAuthenticate.mockResolvedValue({ type: 'success' });
      await expect(gate().attemptUnlock()).resolves.toBe('unlock');
      expect(gate().locked).toBe(false);
      expect(gate().phase).toBe('idle');
    });

    it('cancelamento mantém bloqueado, com mensagem e nova tentativa', async () => {
      mockedAuthenticate.mockResolvedValue({ type: 'cancelled' });
      await expect(gate().attemptUnlock()).resolves.toBe('retry');
      expect(gate().locked).toBe(true);
      expect(gate().requiresPassword).toBe(false);
      expect(gate().message).toMatch(/cancelado/i);
    });

    it('falhas repetidas exigem senha e travam novas tentativas de biometria', async () => {
      mockedAuthenticate.mockResolvedValue({ type: 'failed' });
      await gate().attemptUnlock();
      await gate().attemptUnlock();
      await expect(gate().attemptUnlock()).resolves.toBe('fallback');
      expect(gate().requiresPassword).toBe(true);
      expect(gate().locked).toBe(true);

      mockedAuthenticate.mockClear();
      await gate().attemptUnlock();
      expect(mockedAuthenticate).not.toHaveBeenCalled();
    });

    it('lockout exige senha imediatamente e preserva a preferência até o logout', async () => {
      mockedAuthenticate.mockResolvedValue({ type: 'lockout' });
      await expect(gate().attemptUnlock()).resolves.toBe('fallback');
      expect(gate().requiresPassword).toBe(true);
      expect(mockedClear).not.toHaveBeenCalled();
    });

    it('ignora chamadas concorrentes enquanto autentica', async () => {
      let resolveAuth: (value: { type: 'success' }) => void = () => undefined;
      mockedAuthenticate.mockReturnValue(new Promise((resolve) => { resolveAuth = resolve; }));
      const first = gate().attemptUnlock();
      await expect(gate().attemptUnlock()).resolves.toBe('retry');
      resolveAuth({ type: 'success' });
      await expect(first).resolves.toBe('unlock');
      expect(mockedAuthenticate).toHaveBeenCalledTimes(1);
    });
  });

  describe('enable / disable', () => {
    it('só ativa após confirmar a biometria', async () => {
      mockedAvailability.mockResolvedValue({ available: true });
      mockedAuthenticate.mockResolvedValue({ type: 'success' });
      await expect(gate().enable()).resolves.toEqual({ ok: true });
      expect(mockedSetEnabled).toHaveBeenCalledTimes(1);
      expect(gate().enabled).toBe(true);
      expect(gate().phase).toBe('idle');
    });

    it('não ativa quando a confirmação é cancelada ou falha', async () => {
      mockedAvailability.mockResolvedValue({ available: true });
      mockedAuthenticate.mockResolvedValue({ type: 'cancelled' });
      const result = await gate().enable();
      expect(result.ok).toBe(false);
      expect(mockedSetEnabled).not.toHaveBeenCalled();
      expect(gate().enabled).toBe(false);
    });

    it('não ativa (nem pede biometria) se indisponível: web/simulador/sem cadastro', async () => {
      mockedAvailability.mockResolvedValue({ available: false, reason: 'unsupported_platform' });
      const result = await gate().enable();
      expect(result).toMatchObject({ ok: false });
      expect(mockedAuthenticate).not.toHaveBeenCalled();
      expect(gate().enabled).toBe(false);
    });

    it('falha ao persistir não deixa o gate ligado', async () => {
      mockedAvailability.mockResolvedValue({ available: true });
      mockedAuthenticate.mockResolvedValue({ type: 'success' });
      mockedSetEnabled.mockRejectedValueOnce(new Error('secure store'));
      const result = await gate().enable();
      expect(result.ok).toBe(false);
      expect(gate().enabled).toBe(false);
      expect(gate().phase).toBe('idle');
    });

    it('desativar limpa a preferência persistida', async () => {
      useBiometricGateStore.setState({ enabled: true });
      await gate().disable();
      expect(mockedClear).toHaveBeenCalled();
      expect(gate().enabled).toBe(false);
    });
  });
});
