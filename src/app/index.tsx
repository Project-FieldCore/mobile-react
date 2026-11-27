import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { BrandLogo, gradients } from '@/design-system';
import { useAuthStore } from '@/features/auth/store';

export default function SplashScreen() {
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    ).start();

    if (status !== 'loading') {
      router.replace(status === 'authenticated' ? '/home' : '/welcome');
    }
  }, [pulseAnim, status]);

  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <BrandLogo width={180} />
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
