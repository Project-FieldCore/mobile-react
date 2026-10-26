import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, EmptyState, LoadingState, spacing, typography } from '@/design-system';
import { getInspection, type Inspection } from '@/features/inspections/mockRepository';
import { saveInspectionLocation } from '@/features/inspections/draftStore';

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inspection, setInspection] = useState<Inspection | null | undefined>();
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  useEffect(() => { void getInspection(id).then(setInspection); }, [id]);

  const registerCheckIn = async () => {
    setIsCheckingIn(true);
    setCheckInError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setCheckInError('A localização não foi permitida. Você pode continuar a inspeção sem o check-in.');
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

  if (inspection === undefined) return <LoadingState title="Carregando inspeção..." />;
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
      <Button label="Identificar equipamento por QR Code" variant="secondary" onPress={() => router.push(`/inspections/${inspection.id}/scanner`)} />
      <Button label="Adicionar evidências fotográficas" variant="secondary" onPress={() => router.push(`/inspections/${inspection.id}/evidence`)} />
      <Button label="Iniciar checklist" onPress={() => router.push(`/inspections/${inspection.id}/checklist`)} />
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
