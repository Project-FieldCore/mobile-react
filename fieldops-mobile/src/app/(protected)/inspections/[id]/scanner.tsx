import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, colors, spacing, typography } from '@/design-system';
import { getInspection } from '@/features/inspections/mockRepository';
import { saveEquipmentIdentification } from '@/features/inspections/draftStore';

export default function ScannerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const validate = async (code: string) => {
    const inspection = await getInspection(id);
    const matches = code.trim().toLowerCase() === inspection?.equipment.toLowerCase();
    if (matches) await saveEquipmentIdentification(id, code.trim());
    setScanned(code);
    setMessage(matches ? 'Equipamento confirmado para esta inspeção.' : 'O código lido não corresponde ao equipamento previsto. Confira antes de prosseguir.');
  };

  if (!permission) return <View style={styles.center}><Text style={styles.text}>Verificando permissão da câmera...</Text></View>;
  if (!permission.granted) return <View style={styles.center}><Text style={styles.title}>Use a câmera para ler o QR Code</Text><Text style={styles.text}>Se preferir, você também pode informar o equipamento manualmente.</Text><Button label="Permitir uso da câmera" onPress={() => void requestPermission()} /><ManualEntry value={manualCode} onChange={setManualCode} onSubmit={() => void validate(manualCode)} /><Button label="Voltar" variant="secondary" onPress={() => router.back()} /></View>;

  return <View style={styles.container}><CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned ? undefined : ({ data }) => void validate(data)} /><View style={styles.overlay}><View style={styles.frame} /><Text style={styles.help}>Posicione o QR Code dentro da moldura</Text></View><View style={styles.bottom}>{message ? <Text style={styles.message}>{message}</Text> : null}{scanned ? <Button label="Confirmar e voltar" onPress={() => router.back()} /> : null}<ManualEntry value={manualCode} onChange={setManualCode} onSubmit={() => void validate(manualCode)} /><Button label="Cancelar" variant="secondary" onPress={() => router.back()} /></View></View>;
}

function ManualEntry({ value, onChange, onSubmit }: { value: string; onChange: (value: string) => void; onSubmit: () => void }) { return <View style={styles.manual}><Text style={styles.manualLabel}>Identificação manual</Text><TextInput value={value} onChangeText={onChange} placeholder="Ex.: Transformador TR-04" placeholderTextColor={colors.textMuted} style={styles.input} /><Button label="Validar identificação" variant="secondary" onPress={onSubmit} disabled={!value.trim()} /></View>; }
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.navy }, camera: { flex: 1 }, overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingBottom: 160 }, frame: { width: 230, height: 230, borderWidth: 3, borderColor: colors.greenLight, borderRadius: 20 }, help: { ...typography.body, color: colors.textOnDark, marginTop: spacing.md, textAlign: 'center' }, bottom: { backgroundColor: colors.background, padding: spacing.lg, gap: spacing.sm }, center: { flex: 1, padding: spacing.lg, gap: spacing.md, justifyContent: 'center', backgroundColor: colors.background }, title: { ...typography.title, color: colors.text }, text: { ...typography.body, color: colors.textMuted, lineHeight: 21 }, message: { ...typography.body, color: colors.text, textAlign: 'center' }, manual: { gap: spacing.xs }, manualLabel: { ...typography.caption, color: colors.textMuted }, input: { height: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, color: colors.text, backgroundColor: colors.surface } });
