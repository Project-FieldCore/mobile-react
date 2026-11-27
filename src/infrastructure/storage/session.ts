import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_KEY = 'fieldops.session';

export type Session = {
  accessToken: string;
  refreshToken: string;
  /** Epoch em milissegundos. Delimita o uso local quando não há rede. */
  expiresAt: number;
};

export function isSessionExpired(session: Session, now = Date.now()): boolean {
  return session.expiresAt <= now;
}

export async function getSessionToken(): Promise<string | null> {
  const session = await getSession();
  return session?.accessToken ?? null;
}

export async function setSessionToken(token: string): Promise<void> {
  await setSession({ accessToken: token, refreshToken: '', expiresAt: Date.now() + 15 * 60 * 1000 });
}

export async function clearSessionToken(): Promise<void> {
  await clearSession();
}

export async function getSession(): Promise<Session | null> {
  const serializedSession = await getItem(SESSION_KEY);

  if (!serializedSession) {
    return null;
  }

  try {
    const session = JSON.parse(serializedSession) as Partial<Session>;
    const { accessToken, refreshToken, expiresAt } = session;
    if (
      typeof accessToken === 'string' &&
      typeof refreshToken === 'string' &&
      typeof expiresAt === 'number' &&
      Number.isFinite(expiresAt) &&
      expiresAt > Date.now()
    ) {
      return {
        accessToken,
        refreshToken,
        expiresAt,
      };
    }

    await deleteItem(SESSION_KEY);
    return null;
  } catch {
    await deleteItem(SESSION_KEY);
    return null;
  }
}

export async function setSession(session: Session): Promise<void> {
  await setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await deleteItem(SESSION_KEY);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(key) ?? null;
  }

  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}
