import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, EmptyState, ErrorState, LoadingState, spacing, typography } from '@/design-system';
import { getInspection, startInspection, type Inspection } from '@/features/inspections/mockRepository';
import { hydrateInspectionDraft, saveInspectionLocation } from '@/features/inspections/draftStore';

// The detail screen is the index route for a single inspection.

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inspection, setInspection] = useState<Inspection | null | undefined>();
  const [loadError, setLoadError] = useState(false);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [equipmentCode, setEquipmentCode] = useState<string | null>(null);

  const loadInspection = useCallback(() => {
    setInspection(undefined);
    setLoadError(false);
    void getInspection(id).then(setInspection).catch(() => setLoadError(true));
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(loadInspection, 0);
    return () => clearTimeout(timer);
  }, [loadInspection]);
  useFocusEffect(useCallback(() => { void hydrateInspectionDraft(id).then((draft) => setEquipmentCode(draft?.equipmentCode ?? null)); }, [id]));

  const registerCheckIn = async () => {
    setIsCheckingIn(true);
    setCheckInError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setCheckInError('A localização não foi permitida. Você pode continuar a inspeção sem as coordenadas.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await saveInspectionLocation(id, { latitude: position.coords.latitude, longitude: position.coords.longitude, capturedAt: new Date().toISOString() });
      setCheckIn(`${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)} · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    } catch {
      setCheckInError('Não foi possível obter a localização agora. Verifique o GPS e tente novamente.');
    } finally {
      setIsCheckingIn(false);
    }
  };

  const startChecklist = async () => {
    setIsStarting(true);
    setStartError(null);
    try {
      await startInspection(inspection?.id ?? id);
      router.push(`/inspections/${inspection?.id ?? id}/checklist`);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Não foi possível iniciar a inspeção. Tente novamente.');
    } finally {
      setIsStarting(false);
    }
  };

  if (inspection === undefined) return <LoadingState title="Carregando inspeção..." />;
  if (loadError) return <ErrorState title="Não foi possível carregar a inspeção" description="Verifique sua conexão e tente novamente." onRetry={loadInspection} />;
  if (!inspection) return <EmptyState title="Inspeção não encontrada" description="Volte à lista e selecione outra inspeção." />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <LinearGradient colors={[colors.navy, colors.green]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <Text style={styles.eyebrow}>INSPEÇÃO ATRIBUÍDA</Text><Text style={styles.title}>{inspection.equipment}</Text><Text style={styles.client}>{inspection.client}</Text>
      </LinearGradient>
      <View style={styles.content}>
      <Card style={styles.card}>
        <Detail label="Local" value={inspection.site} />
        <Detail label="Agendamento" value={inspection.scheduledAt} />
        <Detail label="Prioridade" value={priorityLabel[inspection.priority]} />
        <Detail label="Status" value={statusLabel[inspection.status]} />
      </Card>
      <Text style={styles.sectionTitle}>Instruções</Text>
      <Text style={styles.instructions}>{inspection.instructions}</Text>
      <Card style={styles.checkInCard}><Text style={styles.checkInTitle}>Check-in no local</Text><Text style={styles.checkInText}>{checkIn ? `Localização registrada: ${checkIn}` : 'Registre sua localização antes de começar. Este passo é opcional.'}</Text>{checkInError ? <Text style={styles.checkInError}>{checkInError}</Text> : null}<Button label={checkIn ? 'Atualizar localização' : 'Registrar localização'} variant="secondary" loading={isCheckingIn} onPress={() => void registerCheckIn()} /></Card>
      {equipmentCode ? <Text style={styles.checkInText}>Equipamento confirmado: {equipmentCode}</Text> : null}
      <Button label="Identificar equipamento por QR Code" variant="secondary" onPress={() => router.push(`/inspections/${inspection.id}/scanner`)} />
      <Button label="Adicionar evidências fotográficas" variant="secondary" onPress={() => router.push(`/inspections/${inspection.id}/evidence`)} />
      {startError ? <Text style={styles.checkInError}>{startError}</Text> : null}
      <Button label="Iniciar checklist" loading={isStarting} onPress={() => void startChecklist()} />
      <Button label="Voltar para inspeções" variant="secondary" onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}
const priorityLabel = { HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa' };
const statusLabel = { ASSIGNED: 'Atribuída', IN_PROGRESS: 'Em andamento', SUBMITTED: 'Enviada', PENDING_SYNC: 'Aguardando sincronização' };
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background }, scrollContent: { paddingBottom: spacing.xl }, header: { padding: spacing.lg, paddingTop: spacing.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, gap: spacing.xs }, content: { padding: spacing.lg, gap: spacing.md }, eyebrow: { ...typography.caption, color: colors.greenLight, letterSpacing: 1 }, title: { ...typography.title, color: colors.textOnDark }, client: { ...typography.body, color: colors.textOnDark, opacity: 0.85 }, card: { gap: spacing.md }, label: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }, value: { ...typography.body, color: colors.text, marginTop: spacing.xs }, sectionTitle: { ...typography.subtitle, color: colors.text }, instructions: { ...typography.body, color: colors.textMuted, lineHeight: 22 }, checkInCard: { gap: spacing.sm, borderLeftWidth: 4, borderLeftColor: colors.green }, checkInTitle: { ...typography.subtitle, color: colors.text }, checkInText: { ...typography.body, color: colors.textMuted, lineHeight: 21 }, checkInError: { ...typography.caption, color: colors.danger, lineHeight: 18 } });
