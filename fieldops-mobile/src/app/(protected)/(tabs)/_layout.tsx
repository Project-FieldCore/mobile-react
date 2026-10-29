import { Tabs } from 'expo-router';

import { colors } from '@/design-system';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Início' }} />
      <Tabs.Screen name="inspections/index" options={{ title: 'Inspeções' }} />
      <Tabs.Screen name="synchronization/index" options={{ title: 'Sincronização' }} />
    </Tabs>
  );
}
