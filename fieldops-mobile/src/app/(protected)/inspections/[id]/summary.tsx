import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, spacing, typography } from '@/design-system';
import { clearInspectionDraft, getInspectionDraft } from '@/features/inspections/draftStore';
import { completeInspection } from '@/features/inspections/mockRepository';

export default function SummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [completed, setCompleted] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const draft = getInspectionDraft(id);
  const confirm = async () => { try { setCompleteError(null); await completeInspection(id); clearInspectionDraft(id); setCompleted(true); } catch (error) { setCompleteError(error instanceof Error ? error.message : 'Não foi possível concluir a inspeção.'); } };
  if (completed) return <View style={styles.center}><Text style={styles.title}>Inspeção concluída</Text><Text style={styles.description}>Salva no dispositivo e aguardando sincronização.</Text><Button label="Voltar para inspeções" onPress={() => router.replace('/inspections')} /></View>;
  return <ScrollView contentContainerStyle={styles.content}><Text style={styles.title}>Resumo da inspeção</Text><Text style={styles.description}>Revise o preenchimento antes de concluir.</Text><Card style={styles.card}><Text style={styles.label}>Checklist</Text><Text style={styles.value}>Todos os itens obrigatórios foram respondidos.</Text></Card>{draft?.nonConformityDescription ? <Card style={styles.alertCard}><Text style={styles.alertLabel}>Não conformidade registrada</Text><Text style={styles.value}>{draft.nonConformityDescription}</Text></Card> : null}<Card style={styles.card}><Text style={styles.label}>Sincronização</Text><Text style={styles.value}>A conclusão será salva localmente e enviada quando a sincronização estiver disponível.</Text></Card>{completeError ? <Text style={styles.alertLabel}>{completeError}</Text> : null}<Button label="Confirmar conclusão" onPress={() => void confirm()} /><Button label="Voltar ao checklist" variant="secondary" onPress={() => router.back()} /></ScrollView>;
}
const styles = StyleSheet.create({ content: { flexGrow: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background }, center: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background }, title: { ...typography.title, color: colors.text }, description: { ...typography.body, color: colors.textMuted }, card: { gap: spacing.xs }, alertCard: { gap: spacing.xs, borderLeftWidth: 4, borderLeftColor: colors.danger }, label: { ...typography.subtitle, color: colors.text }, alertLabel: { ...typography.subtitle, color: colors.danger }, value: { ...typography.body, color: colors.textMuted, lineHeight: 21 } });
