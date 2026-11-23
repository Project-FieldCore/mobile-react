import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ComponentRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import Svg, { Path } from 'react-native-svg';

import { Button, colors, spacing, typography } from '@/design-system';

export type SignaturePayload = { contentType: 'image/png'; dataBase64: string };

export type SignaturePadHandle = {
  hasSignature: () => boolean;
  capture: () => Promise<SignaturePayload>;
};

type Point = { x: number; y: number };

function pointToPath(point: Point) {
  return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
}

export const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_, ref) {
  const canvasRef = useRef<ComponentRef<typeof View>>(null);
  const [strokes, setStrokes] = useState<string[]>([]);
  const currentStroke = useRef('');

  useImperativeHandle(ref, () => ({
    hasSignature: () => strokes.length > 0,
    capture: async () => ({
      contentType: 'image/png',
      dataBase64: await captureRef(canvasRef, { format: 'png', quality: 1, result: 'base64' }),
    }),
  }), [strokes.length]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      currentStroke.current = pointToPath({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY });
      setStrokes((previous) => [...previous, currentStroke.current]);
    },
    onPanResponderMove: (event) => {
      currentStroke.current += ` L ${event.nativeEvent.locationX.toFixed(1)} ${event.nativeEvent.locationY.toFixed(1)}`;
      setStrokes((previous) => [...previous.slice(0, -1), currentStroke.current]);
    },
  }), []);

  return <View style={styles.wrapper}>
    <Text style={styles.label}>Assinatura do técnico</Text>
    <Text style={styles.helper}>Assine no campo abaixo para concluir a inspeção.</Text>
    <View ref={canvasRef} collapsable={false} style={styles.canvas} {...panResponder.panHandlers}>
      <Svg width="100%" height="100%" pointerEvents="none">
        {strokes.map((stroke, index) => <Path key={`${stroke}-${index}`} d={stroke} stroke={colors.text} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
      </Svg>
      {strokes.length === 0 ? <Text pointerEvents="none" style={styles.placeholder}>Desenhe sua assinatura aqui</Text> : null}
    </View>
    <Button label="Limpar assinatura" variant="secondary" onPress={() => setStrokes([])} disabled={strokes.length === 0} />
  </View>;
});

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { ...typography.subtitle, color: colors.text },
  helper: { ...typography.body, color: colors.textMuted },
  canvas: { height: 180, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', overflow: 'hidden', justifyContent: 'center' },
  placeholder: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
