import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, colors, radius, spacing, typography } from '@/design-system';
import { getInspectionDraft } from '@/features/inspections/draftStore';
import { registerNonConformity, usesExecutionApi } from '@/features/inspections/executionApi';

const SEVERITIES = [
  { id: 'LOW', label: 'Baixa' },
  { id: 'MEDIUM', label: 'Média' },
  { id: 'HIGH', label: 'Alta' },
  { id: 'CRITICAL', label: 'Crítica' },
] as const;

export function NonConformityFields({
  inspectionId,
  itemId,
  description,
  onDescription,
  showError,
}: {
  inspectionId: string;
  itemId: string;
  description: string;
  onDescription: (value: string) => void;
  showError: boolean;
}) {
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]['id']>('MEDIUM');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const register = async () => {
    const draft = getInspectionDraft(inspectionId);
    const photo = (draft?.evidence ?? []).find((item) => item.itemId === itemId && item.uploadStatus !== 'PENDING');
    if (!photo) {
      setFeedback('Adicione uma foto deste item antes de registrar a não conformidade.');
      return;
    }
    if (!description.trim()) {
      setFeedback('Descreva a não conformidade para continuar.');
      return;
    }
    if (!usesExecutionApi()) {
      setSaved(true);
      setFeedback('Não conformidade guardada neste aparelho.');
      return;
    }
    try {
      await registerNonConformity(inspectionId, itemId, severity, description.trim());
      setSaved(true);
      setFeedback('Não conformidade registrada para revisão.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Não foi possível registrar a não conformidade.');
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.label}>Não conformidade *</Text>
      <View style={styles.options}>
        {SEVERITIES.map((option) => (
          <Pressable key={option.id} onPress={() => setSeverity(option.id)} style={[styles.option, severity === option.id && styles.selected]}>
            <Text style={[styles.optionText, severity === option.id && styles.selectedText]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={description} onChangeText={onDescription} placeholder="Informe o que foi identificado e a ação necessária" placeholderTextColor={colors.textMuted} multiline style={styles.area} />
      {showError && !description.trim() ? <Text style={styles.error}>Descreva a não conformidade para continuar.</Text> : null}
      <Button label={saved ? 'Não conformidade registrada' : 'Registrar não conformidade'} variant="secondary" onPress={() => void register()} disabled={saved} />
      {feedback ? <Text style={styles.error}>{feedback}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.xs, borderLeftWidth: 3, borderLeftColor: colors.danger, paddingLeft: spacing.sm },
  label: { ...typography.caption, color: colors.danger, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  selected: { borderColor: colors.navy, backgroundColor: colors.navy },
  optionText: { ...typography.caption, color: colors.textMuted },
  selectedText: { color: colors.textOnDark },
  area: { minHeight: 88, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text, textAlignVertical: 'top' },
  error: { ...typography.caption, color: colors.danger },
});
