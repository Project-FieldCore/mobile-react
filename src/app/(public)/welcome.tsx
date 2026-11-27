import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import {
  BrandLogo,
  Button,
  CircuitPattern,
  colors,
  gradients,
  NetworkPattern,
  spacing,
  typography,
} from '@/design-system';

const ENTRANCE_OFFSET = 18;

export default function WelcomeScreen() {
  const [logoAnim] = useState(() => new Animated.Value(0));
  const [taglineAnim] = useState(() => new Animated.Value(0));
  const [actionsAnim] = useState(() => new Animated.Value(0));
  const [pulseAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.stagger(160, [
      Animated.timing(logoAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
      Animated.timing(taglineAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
      Animated.timing(actionsAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1100, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1100, useNativeDriver: true }),
        ]),
      ).start();
    });
  }, [logoAnim, taglineAnim, actionsAnim, pulseAnim]);

  const fadeUp = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [ENTRANCE_OFFSET, 0],
        }),
      },
    ],
  });

  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <CircuitPattern />
      <NetworkPattern />

      <View style={styles.content}>
        <View style={styles.brand}>
          <Animated.View style={fadeUp(logoAnim)}>
            <BrandLogo width={240} />
          </Animated.View>

          <Animated.View style={fadeUp(taglineAnim)}>
            <Text style={styles.tagline}>
              Inspeções em campo,{'\n'}
              <Text style={styles.taglineHighlight}>resultados que conectam.</Text>
            </Text>
          </Animated.View>
        </View>

        <Animated.View style={[styles.actions, fadeUp(actionsAnim)]}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Button
              label="Começar"
              variant="dark"
              icon="chevron-forward"
              onPress={() => router.push('/login')}
            />
          </Animated.View>
          <Text style={styles.helperText} onPress={() => router.push('/login')}>
            Já tenho uma conta
          </Text>
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl * 3.5,
    paddingBottom: spacing.xl,
  },
  brand: {
    alignItems: 'center',
    gap: spacing.xl,
  },
  tagline: {
    ...typography.title,
    fontSize: 24,
    color: colors.textOnDark,
    textAlign: 'center',
  },
  taglineHighlight: {
    color: colors.greenLight,
  },
  actions: {
    gap: spacing.md,
    alignItems: 'center',
  },
  helperText: {
    ...typography.body,
    color: colors.textOnDark,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
