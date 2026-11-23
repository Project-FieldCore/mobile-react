import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';

import { useAuthStore } from '@/features/auth/store';
import { ThemeProvider, useAppTheme } from '@/features/theme/ThemeProvider';

export default function RootLayout() {
  return <ThemeProvider><RootNavigator /></ThemeProvider>;
}

function RootNavigator() {
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      router.navigate('/(protected)/(tabs)/inspections');
    });
    return () => subscription.remove();
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(public)" />
        <Stack.Screen name="(protected)" />
      </Stack>
      <ThemedStatusBar />
    </>
  );
}

function ThemedStatusBar() {
  const { theme } = useAppTheme();
  return <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />;
}
