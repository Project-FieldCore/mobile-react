import * as Location from 'expo-location';

export type DeviceLocation = { latitude: number; longitude: number; capturedAt: string };

/** Lê o GPS quando o técnico permite. Sem permissão ou sem sinal, devolve vazio para a inspeção seguir. */
export async function captureDeviceLocation(): Promise<DeviceLocation | undefined> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    const permission = current.status === 'granted' ? current : await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return undefined;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      capturedAt: new Date().toISOString(),
    };
  } catch {
    return undefined;
  }
}
