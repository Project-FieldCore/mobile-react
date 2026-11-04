import { apiRequest, ApiError } from '@/infrastructure/api/client';
import { useAuthStore } from './store';

/**
 * Requisição autenticada com renovação controlada (AC-AUTH / PBI-0010.2):
 * 401 com access expirado → POST /auth/refresh → **repete a operação uma vez**.
 * Serviços fora de auth devem usar este helper em vez de `apiRequest` direto.
 */
export async function authenticatedRequest<T>(path: string, options: Parameters<typeof apiRequest>[1] = {}) {
  const initialSession = useAuthStore.getState().session;

  try {
    return await apiRequest<T>(path, { ...options, session: initialSession });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    // Outra requisição pode ter renovado enquanto esta estava em voo — só repete.
    const live = useAuthStore.getState().session;
    if (live?.accessToken && live.accessToken !== initialSession?.accessToken) {
      return apiRequest<T>(path, { ...options, session: live });
    }

    let refreshedSession;
    try {
      refreshedSession = await useAuthStore.getState().refresh();
    } catch (refreshError) {
      // Rede/timeout no refresh: não encerra sessão; propaga o erro.
      throw refreshError;
    }

    if (!refreshedSession) {
      throw error;
    }

    return apiRequest<T>(path, { ...options, session: refreshedSession });
  }
}
