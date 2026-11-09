import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, EmptyState, ErrorState, LoadingState, spacing, typography } from '@/design-system';
import { getPendingSyncCount } from '@/features/inspections/mockRepository';
import { getPendingOperations, retryFailedOperations, simulateSyncOutcome, type PendingOperation } from '@/features/inspections/draftStore';
import { runOutboxSync } from '@/features/inspections/runOutboxSync';

// Synchronization is a tab route.

export default function SynchronizationScreen() {
  const [pending, setPending] = useState(getPendingSyncCount());
  const [operations, setOperations] = useState<PendingOperation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const loadPending = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const next = await getPendingOperations();
      setOperations(next);
      setPending(next.length);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  const statusCount = (status: PendingOperation['status']) => operations.filter((operation) => operation.status === status).length;
  const sync = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const result = await runOutboxSync();
      await loadPending();
      const parts = [
        result.sent ? `${result.sent} confirmada(s)` : null,
        result.conflicts ? `${result.conflicts} conflito(s)` : null,
        result.failed ? `${result.failed} falha(s)` : null,
        result.skipped ? `${result.skipped} mantida(s) para outro fluxo` : null,
      ].filter(Boolean);
      setSyncNotice(parts.length ? `Sincronização concluída: ${parts.join(', ')}.` : 'Nenhuma operação pendente para envio.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível sincronizar agora.';
      setSyncNotice(message);
      await loadPending();
    } finally {
      setSyncing(false);
    }
  };
  const retryFailed = async () => { setSyncing(true); await retryFailedOperations(); await loadPending(); setSyncing(false); };
  const simulate = async (status: 'FAILED' | 'CONFLICT') => { setSyncing(true); await simulateSyncOutcome(status); await loadPending(); setSyncing(false); };
  useFocusEffect(useCallback(() => { void loadPending(); }, [loadPending]));
  if (loading) return <LoadingState title="Carregando fila de sincronização..." />;
  if (loadError) return <ErrorState title="Não foi possível carregar a fila" description="Os dados permanecem seguros neste dispositivo." onRetry={() => void loadPending()} />;
  return (
    <View style={styles.container}>
      <LinearGradient colors={[colors.navy, colors.green]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}><Text style={styles.title}>Sincronização</Text><Text style={styles.subtitle}>Acompanhe os dados salvos no dispositivo.</Text></LinearGradient>
      <Card style={styles.card}><Text style={styles.countValue}>{pending}</Text><Text style={styles.label}>{pending === 1 ? 'operação aguardando envio' : 'operações aguardando envio'}</Text></Card>
      <Card style={styles.card}><Text style={styles.label}>Estado da sincronização</Text><Text style={styles.lastSync}>{syncNotice ?? 'Pronto para enviar respostas via sync push'}</Text></Card>
      {operations.length === 0 ? <EmptyState title="Nenhuma alteração pendente" description="As alterações locais aparecerão aqui antes de serem enviadas." /> : <Card style={styles.card}><Text style={styles.label}>Detalhamento da fila</Text><Text style={styles.value}>Pendentes: {statusCount('PENDING')}</Text><Text style={styles.value}>Enviando: {statusCount('SYNCING')}</Text><Text style={styles.value}>Falhas: {statusCount('FAILED')}</Text><Text style={styles.value}>Conflitos: {statusCount('CONFLICT')}</Text>{operations.map((operation) => <Text key={operation.id} style={styles.value}>{operation.operationType ?? 'ALTERACAO'} · {new Date(operation.createdAt).toLocaleString('pt-BR')}</Text>)}</Card>}
      <Button label="Sincronizar agora" onPress={() => void sync()} loading={syncing} disabled={pending === 0} />
      {statusCount('FAILED') > 0 ? <Button label="Tentar novamente as falhas" variant="secondary" onPress={() => void retryFailed()} loading={syncing} /> : null}
      {__DEV__ ? <View style={styles.developmentActions}><Text style={styles.developmentLabel}>Cenários de desenvolvimento</Text><Button label="Simular falha de envio" variant="secondary" onPress={() => void simulate('FAILED')} disabled={pending === 0} /><Button label="Simular conflito" variant="secondary" onPress={() => void simulate('CONFLICT')} disabled={pending === 0} /></View> : null}
      {pending > 0 ? <Text style={styles.warning}>Os dados permanecem neste dispositivo até a confirmação do servidor. Respostas seguem por /mobile/sync/push; localização, evidência e conclusão ficam na fila para fluxos dedicados.</Text> : null}
      {syncNotice ? <Text style={styles.success}>{syncNotice}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  header: { marginHorizontal: -spacing.lg, padding: spacing.lg, paddingTop: spacing.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, marginBottom: spacing.sm },
  title: {
    ...typography.title,
    color: colors.textOnDark,
  },
  subtitle: { ...typography.body, color: colors.textOnDark, opacity: 0.85, marginTop: spacing.xs },
  card: { gap: spacing.xs },
  countValue: { ...typography.title, fontSize: 36, color: colors.navy },
  label: { ...typography.body, color: colors.textMuted },
  lastSync: { ...typography.subtitle, color: colors.text },
  value: { ...typography.body, color: colors.text, lineHeight: 21 },
  developmentActions: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: spacing.md },
  developmentLabel: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase' },
  success: { ...typography.body, color: colors.success, textAlign: 'center' },
  warning: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
});
