import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, colors, EmptyState, ErrorState, LoadingState, radius, spacing, typography } from '@/design-system';
import { getPendingOperations, type PendingOperation } from '@/features/inspections/draftStore';
import {
  inspectionStatusColor,
  inspectionStatusLabel,
} from '@/features/inspections/inspectionReviewUi';
import { listInspections, type Inspection, type InspectionPriority, type InspectionStatus } from '@/features/inspections/mockRepository';
import { listSyncIndicatorForInspection } from '@/features/inspections/syncStatusUi';

type DateFilter = 'ALL' | 'TODAY' | 'UPCOMING';

// The inspection list belongs to the tab navigator; detail screens are stacked above it.

type StatusFilter = 'ALL' | InspectionStatus;
type PriorityFilter = 'ALL' | InspectionPriority;
const statusFilters: { value: StatusFilter; label: string }[] = [{ value: 'ALL', label: 'Todas' }, { value: 'ASSIGNED', label: 'Atribuídas' }, { value: 'IN_PROGRESS', label: 'Em andamento' }, { value: 'SUBMITTED', label: 'Enviadas' }];
const priorityFilters: { value: PriorityFilter; label: string }[] = [{ value: 'ALL', label: 'Todas prioridades' }, { value: 'HIGH', label: 'Alta' }, { value: 'MEDIUM', label: 'Média' }, { value: 'LOW', label: 'Baixa' }];

export default function InspectionsScreen() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [operations, setOperations] = useState<PendingOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [priority, setPriority] = useState<PriorityFilter>('ALL');
  const [when, setWhen] = useState<DateFilter>('ALL');
  const load = () => {
    setLoading(true);
    setError(false);
    listInspections().then(setInspections).catch(() => setError(true)).finally(() => setLoading(false));
  };
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, []);
  useFocusEffect(useCallback(() => {
    void getPendingOperations().then(setOperations).catch(() => setOperations([]));
  }, []));
  const filtered = useMemo(() => inspections.filter((item) => (status === 'ALL' || item.status === status) && (priority === 'ALL' || item.priority === priority) && matchesDate(item, when)), [inspections, priority, status, when]);
  if (loading) return <LoadingState title="Carregando inspeções..." />;
  if (error) return <ErrorState title="Não foi possível carregar as inspeções" onRetry={load} />;
  return <View style={styles.container}><LinearGradient colors={[colors.navy, colors.green]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}><View style={styles.headerIcon}><Ionicons name="clipboard-outline" size={23} color={colors.textOnDark} /></View><Text style={styles.title}>Inspeções</Text><Text style={styles.subtitle}>Acompanhe suas atividades atribuídas</Text><View style={styles.counter}><Text style={styles.counterText}>{filtered.length} {filtered.length === 1 ? 'atividade' : 'atividades'}</Text></View></LinearGradient><Text style={styles.filterLabel}>Filtrar por status</Text><View style={styles.filters}>{statusFilters.map((filter) => <FilterChip key={filter.value} label={filter.label} selected={status === filter.value} onPress={() => setStatus(filter.value)} />)}</View><Text style={styles.filterLabel}>Filtrar por data</Text><View style={styles.filters}>{([{ value: 'ALL' as const, label: 'Qualquer data' }, { value: 'TODAY' as const, label: 'Hoje' }, { value: 'UPCOMING' as const, label: 'Próximos dias' }]).map((filter) => <FilterChip key={filter.value} label={filter.label} selected={when === filter.value} onPress={() => setWhen(filter.value)} />)}</View><Text style={styles.filterLabel}>Filtrar por prioridade</Text><View style={styles.priorityFilters}>{priorityFilters.map((filter) => <FilterChip key={filter.value} label={filter.label} selected={priority === filter.value} onPress={() => setPriority(filter.value)} />)}</View>{filtered.length === 0 ? <EmptyState title="Nenhuma inspeção encontrada" description="Altere os filtros para ver outras inspeções." /> : <ScrollView contentContainerStyle={styles.list}>{filtered.map((inspection) => <InspectionCard key={inspection.id} inspection={inspection} operations={operations} />)}</ScrollView>}</View>;
}
function matchesDate(inspection: Inspection, filter: DateFilter) {
  if (filter === 'ALL') return true;
  const today = inspection.scheduledAt.startsWith('Hoje') || isSameLocalDay(inspection.scheduledFor, 0);
  if (filter === 'TODAY') return today;
  return inspection.scheduledAt.startsWith('Amanhã') || isSameLocalDay(inspection.scheduledFor, 1) || (!today && Boolean(inspection.scheduledFor));
}
function isSameLocalDay(iso: string | undefined, offsetDays: number) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const target = new Date();
  target.setDate(target.getDate() + offsetDays);
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth() && date.getDate() === target.getDate();
}
function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>; }
function InspectionCard({ inspection, operations }: { inspection: Inspection; operations: PendingOperation[] }) {
  const color = priorityColor[inspection.priority];
  const syncIndicator = listSyncIndicatorForInspection(inspection.id, operations, inspection.status);
  return (
    <Pressable onPress={() => router.push({ pathname: '/inspections/[id]', params: { id: inspection.id } })} style={styles.pressable}>
      <Card style={styles.card}>
        <View style={[styles.priorityStripe, { backgroundColor: color }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={styles.client}>{inspection.client}</Text>
            <View style={[styles.priorityBadge, { backgroundColor: `${color}18` }]}>
              <Text style={[styles.priority, { color }]}>{priorityLabel[inspection.priority]}</Text>
            </View>
          </View>
          <Text style={styles.equipment}>{inspection.equipment}</Text>
          <View style={styles.metaRow}><Ionicons name="location-outline" size={14} color={colors.textMuted} /><Text style={styles.meta}>{inspection.site}</Text></View>
          <View style={styles.metaRow}><Ionicons name="time-outline" size={14} color={colors.textMuted} /><Text style={styles.meta}>{inspection.scheduledAt}</Text></View>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: inspectionStatusColor(inspection.status) }]} />
            <Text style={[styles.status, { color: inspectionStatusColor(inspection.status) }]}>
              {inspectionStatusLabel(inspection.status)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
          {syncIndicator ? (
            <View style={styles.syncRow} accessibilityLabel={syncIndicator.caption}>
              <Ionicons name={syncIndicator.icon} size={14} color={syncIndicator.color} />
              <Text style={[styles.syncCaption, { color: syncIndicator.color }]}>{syncIndicator.caption}</Text>
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}
const priorityColor = { HIGH: colors.danger, MEDIUM: '#B7791F', LOW: colors.success }; const priorityLabel = { HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa' };
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background }, header: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }, headerIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: '#ffffff26', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm }, title: { ...typography.title, color: colors.textOnDark }, subtitle: { ...typography.body, color: colors.textOnDark, opacity: 0.85, marginTop: spacing.xs }, counter: { alignSelf: 'flex-start', backgroundColor: '#ffffff24', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginTop: spacing.md }, counterText: { ...typography.caption, color: colors.textOnDark }, filterLabel: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md, paddingHorizontal: spacing.lg, textTransform: 'uppercase', letterSpacing: 0.6 }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm }, priorityFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md }, chip: { height: 36, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, chipSelected: { backgroundColor: colors.navy, borderColor: colors.navy }, chipText: { ...typography.caption, color: colors.textMuted }, chipTextSelected: { color: colors.textOnDark }, list: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm }, pressable: { borderRadius: radius.lg }, card: { flexDirection: 'row', padding: 0, overflow: 'hidden' }, priorityStripe: { width: 4 }, cardBody: { flex: 1, padding: spacing.md, gap: spacing.xs }, cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, alignItems: 'center' }, client: { ...typography.subtitle, color: colors.text, flexShrink: 1 }, priorityBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }, priority: { ...typography.caption, fontWeight: '700' }, equipment: { ...typography.body, color: colors.textMuted }, metaRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }, meta: { ...typography.caption, color: colors.textMuted }, statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs }, statusDot: { width: 6, height: 6, borderRadius: radius.pill }, status: { ...typography.caption, color: colors.navy, flex: 1 }, syncRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 }, syncCaption: { ...typography.caption, flex: 1 } });
