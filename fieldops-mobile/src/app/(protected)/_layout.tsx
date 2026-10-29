import { Stack } from 'expo-router';

import { RouteGuard } from '@/features/auth/RouteGuard';

export default function ProtectedLayout() {
  return (
    <RouteGuard requiresAuthentication>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="inspections/[id]" />
      </Stack>
    </RouteGuard>
  );
}
