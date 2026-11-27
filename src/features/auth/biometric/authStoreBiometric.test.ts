import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearSession, getSession, setSession } from '@/infrastructure/storage/session';
import { login, logoutSession } from '../api';
import { useAuthStore } from '../store';
import { useBiometricGateStore } from './biometricGateStore';
import { clearBiometricUnlock, isBiometricUnlockEnabled } from './biometricPreference';

vi.mock('@/infrastructure/api/client', () => ({ ApiError: class extends Error {}, apiRequest: vi.fn() }));
vi.mock('../api', () => ({
  login: vi.fn(),
  logoutSession: vi.fn().mockResolvedValue(undefined),
  refreshSession: vi.fn(),
}));
vi.mock('@/infrastructure/storage/session', () => ({
  getSession: vi.fn(),
  setSession: vi.fn().mockResolvedValue(undefined),
  clearSession: vi.fn().mockResolvedValue(undefined),
  isSessionExpired: vi.fn().mockReturnValue(false),
}));
vi.mock('./biometricPreference', () => ({
  isBiometricUnlockEnabled: vi.fn(),
  setBiometricUnlockEnabled: vi.fn().mockResolvedValue(undefined),
  clearBiometricUnlock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./biometricService', () => ({
  getBiometricAvailability: vi.fn(),
  authenticateWithBiometrics: vi.fn(),
}));

const SESSION = { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000 };

describe('sessão × gate biométrico (PBI-0080)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBiometricGateStore.getState().reset();
    useAuthStore.setState({ status: 'loading', session: null });
  });

  it('reabrir com sessão válida e opt-in ligado trava ANTES de liberar a sessão', async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION);
    vi.mocked(isBiometricUnlockEnabled).mockResolvedValue(true);

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useBiometricGateStore.getState().locked).toBe(true);
  });

  it('reabrir com sessão válida e sem opt-in não trava', async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION);
    vi.mocked(isBiometricUnlockEnabled).mockResolvedValue(false);

    await useAuthStore.getState().hydrate();

    expect(useBiometricGateStore.getState().locked).toBe(false);
  });

  it('sessão expirada/ausente limpa o desbloqueio', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(clearBiometricUnlock).toHaveBeenCalled();
    expect(useBiometricGateStore.getState().locked).toBe(false);
  });

  it('logout limpa a sessão, a preferência e o gate', async () => {
    useAuthStore.setState({ status: 'authenticated', session: SESSION });
    useBiometricGateStore.setState({ enabled: true, locked: true, requiresPassword: true });

    await useAuthStore.getState().signOut();

    expect(logoutSession).toHaveBeenCalled();
    expect(clearSession).toHaveBeenCalled();
    expect(clearBiometricUnlock).toHaveBeenCalled();
    expect(useBiometricGateStore.getState()).toMatchObject({ enabled: false, locked: false, requiresPassword: false });
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('logout conclui mesmo se a limpeza da preferência falhar', async () => {
    useAuthStore.setState({ status: 'authenticated', session: SESSION });
    vi.mocked(clearBiometricUnlock).mockRejectedValueOnce(new Error('secure store'));

    await useAuthStore.getState().signOut({ revokeRemote: false });

    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('login por senha libera o gate local', async () => {
    vi.mocked(login).mockResolvedValue(SESSION);
    useBiometricGateStore.setState({ locked: true, requiresPassword: true });

    await useAuthStore.getState().signIn('t@fieldops.test', 'senha');

    expect(setSession).toHaveBeenCalledWith(SESSION);
    expect(useBiometricGateStore.getState().locked).toBe(false);
  });
});
