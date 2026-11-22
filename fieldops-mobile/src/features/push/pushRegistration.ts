import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { apiRequest } from '@/infrastructure/api/client';
import { getSession } from '@/infrastructure/storage/session';
import { pushRegistrationPrerequisiteError } from './pushRegistrationPolicy';

const PUSH_OPT_IN_KEY = 'fieldops.push-opt-in';
type PushOptIn = { token: string; enabled: boolean };

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return Constants.easConfig?.projectId ?? extra?.eas?.projectId;
}

async function readOptIn(): Promise<PushOptIn | null> {
  const value = await SecureStore.getItemAsync(PUSH_OPT_IN_KEY);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PushOptIn>;
    return typeof parsed.token === 'string' && typeof parsed.enabled === 'boolean'
      ? { token: parsed.token, enabled: parsed.enabled }
      : null;
  } catch {
    return null;
  }
}

async function saveOptIn(value: PushOptIn) {
  await SecureStore.setItemAsync(PUSH_OPT_IN_KEY, JSON.stringify(value));
}

async function register(token: string, permissionGranted: boolean) {
  const session = await getSession();
  if (!session) throw new Error('Entre novamente para configurar os alertas.');
  await apiRequest('/mobile/push-subscriptions', {
    method: 'PUT',
    body: { token, permissionGranted },
    session,
  });
}

export async function isPushOptedIn(): Promise<boolean> {
  return (await readOptIn())?.enabled ?? false;
}

/** Solicita consentimento e registra o token do aparelho para novas atribuições. */
export async function enableAssignmentPush(): Promise<void> {
  const easProjectId = projectId();
  const prerequisiteError = pushRegistrationPrerequisiteError({
    platform: Platform.OS, isPhysicalDevice: Device.isDevice, projectId: easProjectId,
  });
  if (prerequisiteError) throw new Error(prerequisiteError);
  const permissions = await Notifications.getPermissionsAsync();
  const granted = permissions.granted || (permissions.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) throw new Error('Permissão de notificações não concedida.');

  const token = (await Notifications.getExpoPushTokenAsync({ projectId: easProjectId })).data;
  await register(token, true);
  await saveOptIn({ token, enabled: true });
}

/** Revoga no servidor o token salvo neste aparelho, mantendo a escolha do usuário. */
export async function disableAssignmentPush(): Promise<void> {
  const subscription = await readOptIn();
  if (!subscription?.token) return;
  await register(subscription.token, false);
  await saveOptIn({ ...subscription, enabled: false });
}

/** Reenvia o registro após novo login, caso o usuário já tenha optado pelo push. */
export async function syncAssignmentPushRegistration(): Promise<void> {
  const subscription = await readOptIn();
  if (subscription?.enabled) await register(subscription.token, true);
}
