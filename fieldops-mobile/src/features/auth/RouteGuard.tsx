import { Redirect } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/design-system';
import { useAuthStore } from './store';

type RouteGuardProps = PropsWithChildren<{ requiresAuthentication: boolean }>;

export function RouteGuard({ children, requiresAuthentication }: RouteGuardProps) {
  const status = useAuthStore((state) => state.status);

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (requiresAuthentication && status !== 'authenticated') {
    return <Redirect href="/welcome" />;
  }

  if (!requiresAuthentication && status === 'authenticated') {
    return <Redirect href="/home" />;
  }

  return children;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
