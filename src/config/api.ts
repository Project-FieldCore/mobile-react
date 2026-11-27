export const API_TIMEOUT_MS = 15_000;

// Read lazily so development in mock mode does not require an API URL.
export function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL?.trim() ?? '';
}
