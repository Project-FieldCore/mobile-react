import { Tabs } from 'expo-router';

import { useAppTheme } from '@/features/theme/ThemeProvider';

export default function TabLayout() {
  const { theme, colors } = useAppTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme === 'dark' ? '#F4F7FB' : colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: theme === 'dark' ? { backgroundColor: '#182338', borderTopColor: '#253650' } : undefined,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Início' }} />
      <Tabs.Screen name="inspections/index" options={{ title: 'Inspeções' }} />
      <Tabs.Screen name="synchronization/index" options={{ title: 'Sincronização' }} />
    </Tabs>
  );
}
