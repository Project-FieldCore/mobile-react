import { create } from 'zustand';

import { login, logoutSession, refreshSession } from './api';
import { clearSession, getSession, isSessionExpired, setSession, type Session } from '@/infrastructure/storage/session';
import { ApiError } from '@/infrastructure/api/client';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
type SignOutOptions = { revokeRemote?: boolean };

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  hydrate: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Renova access+refresh via API (rotação). Requisições simultâneas compartilham
   * uma única chamada — reusar refresh antigo revoga a família no servidor.
   * Erro HTTP de auth → encerra sessão; erro de rede → propaga e mantém a
   * sessão local enquanto o access ainda vale (sessão offline limitada).
   */
  refresh: () => Promise<Session | null>;
  signOut: (options?: SignOutOptions) => Promise<void>;
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
        await get().signOut({ revokeRemote: false });
        return null;
      }

      try {
        const session = await refreshSession(currentSession.refreshToken);
        await setSession(session);
        set({ session, status: 'authenticated' });
        return session;
      } catch (error) {
        // Só derruba a sessão em resposta HTTP da API (ex.: 401 refresh inválido).
        if (error instanceof ApiError && typeof error.status === 'number') {
          await get().signOut({ revokeRemote: false });
          return null;
        }
        // Rede/timeout: mantém tokens locais enquanto o access ainda vale.
        if (error instanceof ApiError && error.status == null && !isSessionExpired(currentSession)) {
          throw error;
        }
        await get().signOut({ revokeRemote: false });
        return null;
      }
    })().finally(() => {
      refreshInFlight = null;
    });

    return refreshInFlight;
  },
  signOut: async ({ revokeRemote = true }: SignOutOptions = {}) => {
    const session = get().session;
    if (revokeRemote && session?.refreshToken) {
      try {
        await logoutSession(session);
      } catch {
        // A limpeza local não pode depender da disponibilidade da rede.
      }
    }
    await clearSession();
    set({ session: null, status: 'unauthenticated' });
  },
}));

/** Só para testes — limpa o voo em andamento entre casos. */
export function __resetRefreshInFlightForTests(): void {
  refreshInFlight = null;
}
