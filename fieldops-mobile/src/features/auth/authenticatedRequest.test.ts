import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '@/infrastructure/api/client';
import { refreshSession } from './api';
import { setSession, clearSession } from '@/infrastructure/storage/session';
import { authenticatedRequest } from './authenticatedRequest';
import { __resetRefreshInFlightForTests, useAuthStore } from './store';

vi.mock('@/infrastructure/api/client', async () => {
  class MockApiError extends Error {
    constructor(
      message: string,
      public readonly status?: number,
      public readonly code?: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  return {
    ApiError: MockApiError,
    apiRequest: vi.fn(),
  };
});

vi.mock('./api', () => ({
  login: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock('@/infrastructure/storage/session', () => ({
  getSession: vi.fn().mockResolvedValue(null),
  setSession: vi.fn().mockResolvedValue(undefined),
  clearSession: vi.fn().mockResolvedValue(undefined),
}));

const mockedApiRequest = apiRequest as unknown as ReturnType<typeof vi.fn>;
const mockedRefreshSession = refreshSession as unknown as ReturnType<typeof vi.fn>;

describe('authenticatedRequest + refresh (PBI-0010.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRefreshInFlightForTests();
    useAuthStore.setState({
      status: 'authenticated',
      session: { accessToken: 'access-old', refreshToken: 'refresh-1' },
    });
  });

  afterEach(() => {
    __resetRefreshInFlightForTests();
  });

  it('em 401 renova a sessão e repete a requisição uma vez com o token novo', async () => {
    mockedApiRequest
      .mockRejectedValueOnce(new ApiError('Unauthorized', 401))
      .mockResolvedValueOnce({ ok: true });
    mockedRefreshSession.mockResolvedValue({
      accessToken: 'access-new',
      refreshToken: 'refresh-2',
    });

    const result = await authenticatedRequest<{ ok: boolean }>('/inspections');

    expect(result).toEqual({ ok: true });
    expect(mockedRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockedRefreshSession).toHaveBeenCalledWith('refresh-1');
    expect(setSession).toHaveBeenCalledWith({ accessToken: 'access-new', refreshToken: 'refresh-2' });
    expect(mockedApiRequest).toHaveBeenCalledTimes(2);
    expect(mockedApiRequest.mock.calls[1][1].session).toEqual({
      accessToken: 'access-new',
      refreshToken: 'refresh-2',
    });
    expect(useAuthStore.getState().session?.accessToken).toBe('access-new');
  });

  it('requisições simultâneas com 401 compartilham uma única renovação', async () => {
    let release!: (session: { accessToken: string; refreshToken: string }) => void;
    const gate = new Promise<{ accessToken: string; refreshToken: string }>((resolve) => {
      release = resolve;
    });
    mockedRefreshSession.mockImplementation(() => gate);
    mockedApiRequest.mockImplementation(async (_path: string, options: { session?: { accessToken: string } }) => {
      if (options.session?.accessToken === 'access-new') return { ok: true };
      throw new ApiError('Unauthorized', 401);
    });

    const pending = Promise.all([
      authenticatedRequest('/a'),
      authenticatedRequest('/b'),
      authenticatedRequest('/c'),
    ]);
    await Promise.resolve();
    release({ accessToken: 'access-new', refreshToken: 'refresh-2' });
    const results = await pending;

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(mockedRefreshSession).toHaveBeenCalledTimes(1);
  });

  it('se o refresh falha com 401, encerra a sessão e propaga o 401 original', async () => {
    mockedApiRequest.mockRejectedValue(new ApiError('Unauthorized', 401));
    mockedRefreshSession.mockRejectedValue(new ApiError('Invalid refresh', 401, 'INVALID_CREDENTIALS'));

    await expect(authenticatedRequest('/inspections')).rejects.toMatchObject({ status: 401 });
    expect(clearSession).toHaveBeenCalled();
    expect(useAuthStore.getState().session).toBeNull();
    expect(mockedApiRequest).toHaveBeenCalledTimes(1);
  });

  it('erro de rede no refresh propaga e mantém a sessão local (offline limitada)', async () => {
    mockedApiRequest.mockRejectedValue(new ApiError('Unauthorized', 401));
    mockedRefreshSession.mockRejectedValue(new ApiError('Não foi possível conectar ao servidor.'));

    await expect(authenticatedRequest('/inspections')).rejects.toMatchObject({
      message: 'Não foi possível conectar ao servidor.',
    });
    expect(clearSession).not.toHaveBeenCalled();
    expect(useAuthStore.getState().session).toEqual({
      accessToken: 'access-old',
      refreshToken: 'refresh-1',
    });
  });

  it('se outra requisição já renovou, só repete sem novo refresh', async () => {
    mockedApiRequest.mockImplementation(async (_path: string, options: { session?: { accessToken: string } }) => {
      if (options.session?.accessToken === 'access-already-new') {
        return { ok: true };
      }
      // Outra requisição renovou enquanto esta recebia 401.
      useAuthStore.setState({
        session: { accessToken: 'access-already-new', refreshToken: 'refresh-2' },
      });
      throw new ApiError('Unauthorized', 401);
    });

    const result = await authenticatedRequest('/inspections');

    expect(result).toEqual({ ok: true });
    expect(mockedRefreshSession).not.toHaveBeenCalled();
    expect(mockedApiRequest).toHaveBeenCalledTimes(2);
    expect(mockedApiRequest.mock.calls[1][1].session.accessToken).toBe('access-already-new');
  });
});
