import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BIOMETRIC_UNLOCK_KEY = 'fieldops.biometric-unlock';

/** Preferência opt-in "Desbloquear com biometria". Só flag local; sem credenciais. */
export async function isBiometricUnlockEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await SecureStore.getItemAsync(BIOMETRIC_UNLOCK_KEY)) === '1';
}

export async function setBiometricUnlockEnabled(): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(BIOMETRIC_UNLOCK_KEY, '1');
}

export async function clearBiometricUnlock(): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(BIOMETRIC_UNLOCK_KEY);
}
