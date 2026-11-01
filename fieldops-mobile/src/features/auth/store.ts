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
  refresh: () => Promise<Session | null>;
  signOut: (options?: SignOutOptions) => Promise<void>;
};

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
  refresh: async () => {
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
      // Sem rede, a sessão local permanece acessível somente até o vencimento do access token.
      if (error instanceof ApiError && error.status == null && !isSessionExpired(currentSession)) {
        return null;
      }
      await get().signOut({ revokeRemote: false });
      return null;
    }
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
