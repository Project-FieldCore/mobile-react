import { create } from 'zustand';

import { ApiError } from '@/infrastructure/api/client';
import { login, refreshSession } from './api';
import { clearSession, getSession, setSession, type Session } from '@/infrastructure/storage/session';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  hydrate: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Renova access+refresh via API (rotação). Requisições simultâneas compartilham
   * uma única chamada — reusar refresh antigo revoga a família no servidor.
   * Erro HTTP de auth → encerra sessão; erro de rede → propaga e mantém a
   * sessão local (sessão offline limitada).
   */
  refresh: () => Promise<Session | null>;
  signOut: () => Promise<void>;
};

/** Uma renovação por vez (equivalente ao refreshSession do web). */
let refreshInFlight: Promise<Session | null> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  session: null,
  hydrate: async () => {
    const session = await getSession();
    set({ session, status: session ? 'authenticated' : 'unauthenticated' });
  },
  signIn: async (email, password) => {
    const session = await login({ email, password });
    await setSession(session);
    set({ session, status: 'authenticated' });
  },
  refresh: () => {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      const currentSession = get().session;
      if (!currentSession?.refreshToken) {
        await get().signOut();
        return null;
      }

      try {
        const session = await refreshSession(currentSession.refreshToken);
        await setSession(session);
        set({ session, status: 'authenticated' });
        return session;
      } catch (error) {
        // Só derruba a sessão em resposta HTTP da API (ex.: 401 refresh inválido).
        // Timeout/rede (ApiError sem status) mantém tokens locais para uso offline.
        if (error instanceof ApiError && typeof error.status === 'number') {
          await get().signOut();
          return null;
        }
        throw error;
      }
    })().finally(() => {
      refreshInFlight = null;
    });

    return refreshInFlight;
  },
  signOut: async () => {
    await clearSession();
    set({ session: null, status: 'unauthenticated' });
  },
}));

/** Só para testes — limpa o voo em andamento entre casos. */
export function __resetRefreshInFlightForTests(): void {
  refreshInFlight = null;
}
