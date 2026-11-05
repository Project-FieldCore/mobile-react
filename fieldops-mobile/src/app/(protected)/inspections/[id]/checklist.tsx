import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, colors, radius, spacing, typography } from '@/design-system';
import { getInspectionDraft, hydrateInspectionDraft, saveInspectionAnswers } from '@/features/inspections/draftStore';
import { NonConformityFields } from '@/features/inspections/NonConformityFields';
import { getInspectionChecklist, type ChecklistItem, type ChecklistSection } from '@/features/inspections/mockRepository';

export default function ChecklistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const savedDraft = getInspectionDraft(id);
  const [sections, setSections] = useState<ChecklistSection[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>(savedDraft?.answers ?? {});
  const [nonConformityDescription, setNonConformityDescription] = useState(savedDraft?.nonConformityDescription ?? '');
  const [submitted, setSubmitted] = useState(false);
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
    if (draftHydrated.current) saveInspectionAnswers(id, answers, nonConformityDescription);
  }, [answers, id, nonConformityDescription]);
  useEffect(() => {
    void getInspectionChecklist(id).then((checklist) => setSections(checklist ?? []));
  }, [id]);
  const items = sections.flatMap((section) => section.items);
  const required = items.filter((item) => item.required);
  const hasNonConformity = answers.visual === 'Não conforme';
  const completed = required.filter((item) => answers[item.id]).length;
  const pending = required.filter((item) => !answers[item.id]);
  const requiresDescription = hasNonConformity && !nonConformityDescription.trim();
  const progress = required.length ? Math.round((completed / required.length) * 100) : 0;
  const change = (fieldId: string, value: string) => setAnswers((current) => {
    const nextAnswers = { ...current, [fieldId]: value };
    saveInspectionAnswers(id, nextAnswers, nonConformityDescription);
    return nextAnswers;
  });
  const finish = () => {
    if (pending.length || requiresDescription) { setSubmitted(true); return; }
    saveInspectionAnswers(id, answers, hasNonConformity ? nonConformityDescription.trim() : '');
    router.push({ pathname: '/inspections/[id]/summary', params: { id } });
  };
  return <View style={styles.container}><View style={styles.header}><Text style={styles.title}>Checklist</Text><Text style={styles.progressText}>{completed}/{required.length} obrigatórios respondidos{pending.length ? ` · Pendentes: ${pending.map((item) => item.label).join(', ')}` : ''}</Text><View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View></View><ScrollView contentContainerStyle={styles.content}>{sections.map((section) => <View key={section.title} style={styles.section}><Text style={styles.sectionTitle}>{section.title}</Text>{section.items.map((item) => <Card key={item.id} style={styles.card}><Text style={styles.label}>{item.label}{item.required ? <Text style={styles.required}> *</Text> : null}</Text><Input item={item} value={answers[item.id]} onChange={(value) => change(item.id, value)} /><Button label="Adicionar foto" variant="secondary" onPress={() => router.push({ pathname: '/inspections/[id]/evidence', params: { id, itemId: item.id } })} />{item.type === 'conformity' && answers[item.id] === 'Não conforme' ? <NonConformityFields inspectionId={id} itemId={item.id} description={nonConformityDescription} onDescription={setNonConformityDescription} showError={submitted && requiresDescription} /> : null}{submitted && item.required && !answers[item.id] ? <Text style={styles.error}>Este item é obrigatório.</Text> : null}</Card>)}</View>)}<Button label="Concluir checklist" onPress={finish} /><Button label="Voltar" variant="secondary" onPress={() => router.back()} /></ScrollView></View>;
}
function Input({ item, value, onChange }: { item: ChecklistItem; value?: string; onChange: (value: string) => void }) { if (['text', 'long', 'number', 'date'].includes(item.type)) return <TextInput value={value} onChangeText={onChange} placeholder={item.type === 'date' ? 'DD/MM/AAAA' : 'Digite sua resposta'} keyboardType={item.type === 'number' ? 'numeric' : 'default'} multiline={item.type === 'long' || item.id === 'notes'} style={[styles.input, (item.type === 'long' || item.id === 'notes') && styles.area]} placeholderTextColor={colors.textMuted} />; const options = item.type === 'boolean' ? ['Sim', 'Não'] : item.type === 'conformity' ? ['Conforme', 'Não conforme', 'Não aplicável'] : item.options ?? []; return <View style={styles.options}>{options.map((option) => <Pressable key={option} onPress={() => onChange(option)} style={[styles.option, value === option && styles.selected]}><Text style={[styles.optionText, value === option && styles.selectedText]}>{option}</Text></Pressable>)}</View>; }
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background }, header: { backgroundColor: colors.navy, padding: spacing.lg, gap: spacing.sm }, title: { ...typography.title, color: colors.textOnDark }, progressText: { ...typography.caption, color: colors.textOnDark }, track: { height: 8, borderRadius: radius.pill, backgroundColor: '#ffffff40', overflow: 'hidden' }, fill: { height: '100%', backgroundColor: colors.greenLight }, content: { padding: spacing.lg, gap: spacing.lg }, section: { gap: spacing.sm }, sectionTitle: { ...typography.subtitle, color: colors.text }, card: { gap: spacing.sm }, label: { ...typography.body, color: colors.text, fontWeight: '600' }, required: { color: colors.danger }, input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.text, ...typography.body }, area: { minHeight: 88, textAlignVertical: 'top', paddingVertical: spacing.sm }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, option: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, selected: { borderColor: colors.navy, backgroundColor: colors.navy }, optionText: { ...typography.caption, color: colors.textMuted }, selectedText: { color: colors.textOnDark }, nonConformity: { gap: spacing.xs, borderLeftWidth: 3, borderLeftColor: colors.danger, paddingLeft: spacing.sm }, nonConformityLabel: { ...typography.caption, color: colors.danger, fontWeight: '700' }, error: { ...typography.caption, color: colors.danger } });
