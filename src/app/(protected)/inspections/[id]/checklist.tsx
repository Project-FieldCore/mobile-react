import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, colors, EmptyState, ErrorState, LoadingState, radius, spacing, typography } from '@/design-system';
import {
  getInspectionDraft,
  getPendingOperations,
  hydrateInspectionDraft,
  saveInspectionAnswers,
  type PendingOperation,
} from '@/features/inspections/draftStore';
import { NonConformityFields } from '@/features/inspections/NonConformityFields';
import { getInspection, getInspectionChecklist, type ChecklistItem, type ChecklistSection } from '@/features/inspections/mockRepository';
import { parseAnswerSyncPayload } from '@/features/inspections/syncPushMapper';

export default function ChecklistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const savedDraft = getInspectionDraft(id);
  const [sections, setSections] = useState<ChecklistSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>(savedDraft?.answers ?? {});
  const [nonConformityDescription, setNonConformityDescription] = useState(savedDraft?.nonConformityDescription ?? '');
  const [baseVersion, setBaseVersion] = useState(savedDraft?.baseVersion ?? 0);
  const [submitted, setSubmitted] = useState(false);
  const [conflictOps, setConflictOps] = useState<PendingOperation[]>([]);
  const draftHydrated = useRef(false);

  useEffect(() => {
    void hydrateInspectionDraft(id).then((draft) => {
      if (!draft) {
        draftHydrated.current = true;
        return;
      }
      setAnswers(draft.answers);
      setNonConformityDescription(draft.nonConformityDescription ?? '');
      draftHydrated.current = true;
    });
  }, [id]);
  useEffect(() => {
    if (draftHydrated.current) saveInspectionAnswers(id, answers, nonConformityDescription, baseVersion);
  }, [answers, baseVersion, id, nonConformityDescription]);
  const loadChecklist = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    void Promise.all([getInspectionChecklist(id), getInspection(id)])
      .then(([checklist, inspection]) => {
        setSections(checklist ?? []);
        if (typeof inspection?.version === 'number') setBaseVersion(inspection.version);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => {
    const timer = setTimeout(loadChecklist, 0);
    return () => clearTimeout(timer);
  }, [loadChecklist]);
  useFocusEffect(useCallback(() => {
    void getPendingOperations()
      .then((operations) => setConflictOps(operations.filter((operation) => (
        operation.inspectionId === id && operation.status === 'CONFLICT'
      ))))
      .catch(() => setConflictOps([]));
  }, [id]));
  const conflictByItem = useMemo(() => {
    const map = new Map<string, string>();
    for (const operation of conflictOps) {
      const payload = parseAnswerSyncPayload(operation.payload);
      if (payload?.inspectionItemId) map.set(payload.inspectionItemId, operation.id);
    }
    return map;
  }, [conflictOps]);
  const items = sections.flatMap((section) => section.items);
  const required = items.filter((item) => item.required);
  const hasNonConformity = answers.visual === 'Não conforme';
  const completed = required.filter((item) => answers[item.id]).length;
  const pending = required.filter((item) => !answers[item.id]);
  const requiresDescription = hasNonConformity && !nonConformityDescription.trim();
  const progress = required.length ? Math.round((completed / required.length) * 100) : 0;
  const change = (fieldId: string, value: string) => setAnswers((current) => {
    const nextAnswers = { ...current, [fieldId]: value };
    saveInspectionAnswers(id, nextAnswers, nonConformityDescription, baseVersion);
    return nextAnswers;
  });
  const finish = () => {
    if (pending.length || requiresDescription) { setSubmitted(true); return; }
    void saveInspectionAnswers(id, answers, hasNonConformity ? nonConformityDescription.trim() : '', baseVersion).then(() => {
      router.push({ pathname: '/inspections/[id]/summary', params: { id } });
    });
  };
  if (loading) return <LoadingState title="Carregando checklist..." />;
  if (loadError) return <ErrorState title="Não foi possível carregar o checklist" description="Verifique sua conexão e tente novamente." onRetry={loadChecklist} />;
  if (!sections.length) return <EmptyState title="Checklist indisponível" description="Esta inspeção ainda não possui itens para preenchimento." />;
  return <View style={styles.container}><View style={styles.header}><Text style={styles.title}>Checklist</Text><Text style={styles.progressText}>{completed}/{required.length} obrigatórios respondidos{pending.length ? ` · Pendentes: ${pending.map((item) => item.label).join(', ')}` : ''}</Text><View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View></View><ScrollView contentContainerStyle={styles.content}>{sections.map((section) => <View key={section.title} style={styles.section}><Text style={styles.sectionTitle}>{section.title}</Text>{section.items.map((item) => {
    const conflictOperationId = conflictByItem.get(item.id);
    return <Card key={item.id} style={styles.card}><View style={styles.labelRow}><Text style={styles.label}>{item.label}{item.required ? <Text style={styles.required}> *</Text> : null}</Text>{conflictOperationId ? <Pressable accessibilityRole="button" accessibilityLabel="Item com conflito de sincronização. Toque para analisar." onPress={() => router.push({ pathname: '/synchronization/conflict/[operationId]', params: { operationId: conflictOperationId } })} style={styles.conflictBadge}><Text style={styles.conflictBadgeText}>Conflito</Text></Pressable> : null}</View><Input item={item} value={answers[item.id]} onChange={(value) => change(item.id, value)} /><Button label="Adicionar foto" variant="secondary" onPress={() => router.push({ pathname: '/inspections/[id]/evidence', params: { id, itemId: item.id } })} />{item.type === 'conformity' && answers[item.id] === 'Não conforme' ? <NonConformityFields inspectionId={id} itemId={item.id} description={nonConformityDescription} onDescription={setNonConformityDescription} showError={submitted && requiresDescription} /> : null}{submitted && item.required && !answers[item.id] ? <Text style={styles.error}>Este item é obrigatório.</Text> : null}</Card>;
  })}</View>)}<Button label="Concluir checklist" onPress={finish} /><Button label="Voltar" variant="secondary" onPress={() => router.back()} /></ScrollView></View>;
}
function Input({ item, value, onChange }: { item: ChecklistItem; value?: string; onChange: (value: string) => void }) { if (['text', 'long', 'number', 'date'].includes(item.type)) return <TextInput value={value} onChangeText={onChange} placeholder={item.type === 'date' ? 'DD/MM/AAAA' : 'Digite sua resposta'} keyboardType={item.type === 'number' ? 'numeric' : 'default'} multiline={item.type === 'long' || item.id === 'notes'} style={[styles.input, (item.type === 'long' || item.id === 'notes') && styles.area]} placeholderTextColor={colors.textMuted} />; const options = item.type === 'boolean' ? ['Sim', 'Não'] : item.type === 'conformity' ? ['Conforme', 'Não conforme', 'Não aplicável'] : item.options ?? []; return <View style={styles.options}>{options.map((option) => <Pressable key={option} onPress={() => onChange(option)} style={[styles.option, value === option && styles.selected]}><Text style={[styles.optionText, value === option && styles.selectedText]}>{option}</Text></Pressable>)}</View>; }
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background }, header: { backgroundColor: colors.navy, padding: spacing.lg, gap: spacing.sm }, title: { ...typography.title, color: colors.textOnDark }, progressText: { ...typography.caption, color: colors.textOnDark }, track: { height: 8, borderRadius: radius.pill, backgroundColor: '#ffffff40', overflow: 'hidden' }, fill: { height: '100%', backgroundColor: colors.greenLight }, content: { padding: spacing.lg, gap: spacing.lg }, section: { gap: spacing.sm }, sectionTitle: { ...typography.subtitle, color: colors.text }, card: { gap: spacing.sm }, labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, label: { ...typography.body, color: colors.text, fontWeight: '600', flexShrink: 1 }, conflictBadge: { borderRadius: radius.pill, backgroundColor: '#B7791F22', paddingHorizontal: spacing.sm, paddingVertical: 4 }, conflictBadgeText: { ...typography.caption, color: '#B7791F', fontWeight: '700' }, required: { color: colors.danger }, input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.text, ...typography.body }, area: { minHeight: 88, textAlignVertical: 'top', paddingVertical: spacing.sm }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, option: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, selected: { borderColor: colors.navy, backgroundColor: colors.navy }, optionText: { ...typography.caption, color: colors.textMuted }, selectedText: { color: colors.textOnDark }, nonConformity: { gap: spacing.xs, borderLeftWidth: 3, borderLeftColor: colors.danger, paddingLeft: spacing.sm }, nonConformityLabel: { ...typography.caption, color: colors.danger, fontWeight: '700' }, error: { ...typography.caption, color: colors.danger } });
