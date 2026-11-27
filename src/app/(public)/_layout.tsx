import { Stack } from 'expo-router';

import { RouteGuard } from '@/features/auth/RouteGuard';

export default function PublicLayout() {
  return (
    <RouteGuard requiresAuthentication={false}>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="verify-code" />
      <Stack.Screen name="reset-password" />
    </Stack>
    </RouteGuard>
  );
}
