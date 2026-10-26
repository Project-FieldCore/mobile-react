import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Button, colors, spacing, typography } from '@/design-system';
import { addInspectionEvidence } from '@/features/inspections/draftStore';

export default function EvidenceScreen() {
  const { id, itemId } = useLocalSearchParams<{ id: string; itemId?: string }>();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const capture = async () => {
    if (!cameraRef.current) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.65 });
      if (photo?.uri) setPhotoUri(photo.uri);
    } finally {
      setIsCapturing(false);
    }
  };

  if (!permission) return <View style={styles.center}><Text style={styles.text}>Preparando câmera...</Text></View>;
  if (!permission.granted) return <View style={styles.center}><Text style={styles.title}>Anexe uma evidência fotográfica</Text><Text style={styles.text}>A foto ajuda a documentar a condição do equipamento e ficará vinculada à inspeção.</Text><Button label="Permitir uso da câmera" onPress={() => void requestPermission()} /><Button label="Voltar" variant="secondary" onPress={() => router.back()} /></View>;

  const savePhoto = async () => {
    if (!photoUri) return;
    const capturedAt = new Date().toISOString();
    const extension = photoUri.split('.').pop()?.split('?')[0] || 'jpg';
    const destination = `${FileSystem.documentDirectory}fieldops-evidence-${id}-${Date.now()}.${extension}`;
    await FileSystem.copyAsync({ from: photoUri, to: destination });
    await addInspectionEvidence(id, { uri: destination, capturedAt, itemId });
    router.back();
  };
  if (photoUri) return <View style={styles.preview}><Image source={{ uri: photoUri }} style={styles.image} /><View style={styles.previewBottom}><Text style={styles.title}>Evidência capturada</Text><Text style={styles.text}>A foto foi salva no dispositivo e será enviada junto com a inspeção quando houver sincronização.</Text><Button label="Usar esta foto" onPress={() => void savePhoto()} /><Button label="Tirar outra foto" variant="secondary" onPress={() => setPhotoUri(null)} /></View></View>;

  return <View style={styles.cameraContainer}><CameraView ref={cameraRef} style={styles.camera} facing="back" /><View style={styles.cameraBottom}><Text style={styles.cameraText}>Fotografe o equipamento ou a não conformidade identificada.</Text><Button label="Capturar foto" loading={isCapturing} onPress={() => void capture()} /><Button label="Cancelar" variant="light" onPress={() => router.back()} /></View></View>;
}

const styles = StyleSheet.create({ cameraContainer: { flex: 1, backgroundColor: colors.navy }, camera: { flex: 1 }, cameraBottom: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.navy }, cameraText: { ...typography.body, color: colors.textOnDark, lineHeight: 21, textAlign: 'center' }, center: { flex: 1, padding: spacing.lg, gap: spacing.md, justifyContent: 'center', backgroundColor: colors.background }, preview: { flex: 1, backgroundColor: colors.navy }, image: { flex: 1, width: '100%' }, previewBottom: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.background }, title: { ...typography.title, color: colors.text }, text: { ...typography.body, color: colors.textMuted, lineHeight: 21 } });
