import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { createUuid, isUuid } from '@/features/inspections/uuid';

const DEVICE_ID_KEY = 'fieldops.device-id';

async function readDeviceId(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(DEVICE_ID_KEY) ?? null;
  }
  return SecureStore.getItemAsync(DEVICE_ID_KEY);
}

async function writeDeviceId(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(DEVICE_ID_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(DEVICE_ID_KEY, value);
}

/** Identificador estável do aparelho exigido por POST /mobile/sync/push. */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await readDeviceId();
  if (existing && isUuid(existing)) return existing;

  const created = createUuid();
  await writeDeviceId(created);
  return created;
}
