import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, spacing, typography } from '@/design-system';
import { clearInspectionDraft, getInspectionDraft } from '@/features/inspections/draftStore';
import { completeInspection } from '@/features/inspections/mockRepository';

export default function SummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [completed, setCompleted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const completingRef = useRef(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const draft = getInspectionDraft(id);
  const confirm = async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    setCompleting(true);
    try {
      setCompleteError(null);
      const result = await completeInspection(id);
      if (!result.coordinatesSent) setLocationNote('A localização não foi permitida. A conclusão segue sem as coordenadas.');
      clearInspectionDraft(id);
      setCompleted(true);
    } catch (error) {
      setCompleteError(error instanceof Error ? error.message : 'Não foi possível concluir a inspeção.');
    } finally {
      completingRef.current = false;
      setCompleting(false);
    }
  };
  if (completed) return <View style={styles.center}><Text style={styles.title}>Inspeção concluída</Text><Text style={styles.description}>Salva no dispositivo e aguardando sincronização.</Text>{locationNote ? <Text style={styles.description}>{locationNote}</Text> : null}<Button label="Voltar para inspeções" onPress={() => router.replace('/inspections')} /></View>;
  return <ScrollView contentContainerStyle={styles.content}><Text style={styles.title}>Resumo da inspeção</Text><Text style={styles.description}>Revise o preenchimento antes de concluir.</Text><Card style={styles.card}><Text style={styles.label}>Checklist</Text><Text style={styles.value}>Todos os itens obrigatórios foram respondidos.</Text></Card>{draft?.nonConformityDescription ? <Card style={styles.alertCard}><Text style={styles.alertLabel}>Não conformidade registrada</Text><Text style={styles.value}>{draft.nonConformityDescription}</Text></Card> : null}<Card style={styles.card}><Text style={styles.label}>Sincronização</Text><Text style={styles.value}>A conclusão será salva localmente e enviada quando a sincronização estiver disponível.</Text></Card>{completing ? <Text style={styles.description}>Enviando conclusão…</Text> : null}{completeError ? <Text style={styles.alertLabel}>{completeError}</Text> : null}<Button label={completing ? 'Concluindo…' : 'Confirmar conclusão'} onPress={() => void confirm()} loading={completing} disabled={completing} /><Button label="Voltar ao checklist" variant="secondary" onPress={() => router.back()} disabled={completing} /></ScrollView>;
}
const styles = StyleSheet.create({ content: { flexGrow: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background }, center: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background }, title: { ...typography.title, color: colors.text }, description: { ...typography.body, color: colors.textMuted }, card: { gap: spacing.xs }, alertCard: { gap: spacing.xs, borderLeftWidth: 4, borderLeftColor: colors.danger }, label: { ...typography.subtitle, color: colors.text }, alertLabel: { ...typography.subtitle, color: colors.danger }, value: { ...typography.body, color: colors.textMuted, lineHeight: 21 } });
