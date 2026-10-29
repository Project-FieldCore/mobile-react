import { ApiError, apiRequest } from '@/infrastructure/api/client';
import { findContractUserByEmail } from '@/infrastructure/api/contractMocks';
import type { Session } from '@/infrastructure/storage/session';
import { dataSource } from '@/config/dataSource';
import { DEMO_PASSWORD } from '@/data/demoCredentials';

export type LoginInput = {
  email: string;
  password: string;
};

type SessionResponse = {
  accessToken: string;
  refreshToken: string;
};

const MOCK_SESSION: Session = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Login mock: e-mail deve existir no mock OpenAPI (`fieldops-v1.json`);
 * senha vem de `demoCredentials` (não está no contrato).
 */
export async function login(input: LoginInput): Promise<Session> {
  if (dataSource === 'mock') {
    await wait(350);
    const user = findContractUserByEmail(input.email);
    if (!user || user.status !== 'ACTIVE' || input.password !== DEMO_PASSWORD) {
      throw new ApiError(
        'E-mail ou senha inválidos.',
        401,
        'INVALID_CREDENTIALS',
        '/api/v1/auth/login',
        undefined,
        undefined,
        new Date().toISOString(),
      );
    }

    return MOCK_SESSION;
  }

  return apiRequest<SessionResponse>('/auth/login', { method: 'POST', body: input });
}

export function refreshSession(refreshToken: string): Promise<Session> {
  if (dataSource === 'mock') {
    return Promise.resolve(MOCK_SESSION);
  }

  return apiRequest<SessionResponse>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
}
