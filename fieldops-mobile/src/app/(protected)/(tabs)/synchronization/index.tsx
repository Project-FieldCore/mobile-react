import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, EmptyState, ErrorState, LoadingState, spacing, typography } from '@/design-system';
import { useAuthStore } from '@/features/auth/store';
import { getPendingOperations, retryFailedOperations, simulateSyncOutcome, type PendingOperation } from '@/features/inspections/draftStore';
import { getLastPullServerTime, getLastSyncAt } from '@/features/inspections/syncCursorStore';
import { runMobileSync } from '@/features/inspections/runMobileSync';
import {
  composeSyncFailureBanner,
  composeSyncSuccessBanner,
  countByStatus,
  formatSyncInstant,
  humanizeSyncError,
  operationStatusColor,
  operationStatusLabel,
  operationTypeLabel,
  SYNC_WARNING_COLOR,
  type SyncBannerModel,
} from '@/features/inspections/syncStatusUi';

export default function SynchronizationScreen() {
  const params = useLocalSearchParams<{ sync?: string }>();
  const signOut = useAuthStore((state) => state.signOut);
  const autoSyncConsumed = useRef(false);

  const [operations, setOperations] = useState<PendingOperation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState<SyncBannerModel | null>(null);
  const [lastSyncLabel, setLastSyncLabel] = useState('Ainda não sincronizado');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadPending = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setLoading(true);
      setLoadError(false);
    }
    try {
      const [next, syncedAt, serverTime] = await Promise.all([
        getPendingOperations(),
        getLastSyncAt(),
        getLastPullServerTime(),
      ]);
      setOperations(next);
      setLastSyncLabel(formatSyncInstant(syncedAt ?? serverTime));
    } catch {
      if (!options?.quiet) setLoadError(true);
    } finally {
      if (!options?.quiet) setLoading(false);
    }
  }, []);

  const counts = countByStatus(operations);

  const sync = useCallback(async () => {
    setSyncing(true);
    setBanner({ kind: 'syncing', message: 'Sincronizando…' });
    try {
      const result = await runMobileSync();
      await loadPending({ quiet: true });
      setBanner(composeSyncSuccessBanner(result));
    } catch (error) {
      setBanner(composeSyncFailureBanner(error));
      await loadPending({ quiet: true });
    } finally {
      setSyncing(false);
    }
  }, [loadPending]);

  const retryFailed = async () => {
    await retryFailedOperations();
    await sync();
  };

  const simulate = async (status: 'FAILED' | 'CONFLICT') => {
    setSyncing(true);
    await simulateSyncOutcome(status);
    await loadPending({ quiet: true });
    setSyncing(false);
  };

  useFocusEffect(useCallback(() => {
    void loadPending().then(() => {
      if (params.sync === '1' && !autoSyncConsumed.current) {
        autoSyncConsumed.current = true;
        router.setParams({ sync: undefined });
        void sync();
      }
    });
  }, [loadPending, params.sync, sync]));

  if (loading) return <LoadingState title="Carregando fila de sincronização..." />;
  if (loadError) {
    return (
      <ErrorState
        title="Não foi possível carregar a fila"
        description="Os dados permanecem seguros neste dispositivo."
        onRetry={() => void loadPending()}
      />
    );
  }

  const bannerStyle = banner?.kind === 'success'
    ? styles.success
    : banner?.kind === 'partial'
      ? styles.partial
      : banner?.kind === 'syncing'
        ? styles.value
        : styles.error;

  return (
    <View style={styles.container}>
      <LinearGradient colors={[colors.navy, colors.green]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <Text style={styles.title}>Sincronização</Text>
        <Text style={styles.subtitle}>Envio da outbox e download incremental por cursor.</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.countValue}>{counts.total}</Text>
          <Text style={styles.label}>
            {counts.total === 1 ? 'operação aguardando envio' : 'operações aguardando envio'}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.label}>Última sincronização</Text>
          <Text style={styles.lastSync}>{lastSyncLabel}</Text>
          <Text style={styles.value}>
            {banner?.kind === 'syncing'
              ? banner.message
              : 'Toque em sincronizar para enviar e baixar mudanças.'}
          </Text>
        </Card>

        {operations.length === 0 ? (
          <EmptyState
            title="Nenhuma alteração pendente de envio"
            description="Você ainda pode sincronizar para baixar inspeções e respostas do servidor."
          />
        ) : (
          <Card style={styles.card}>
            <Text style={styles.label}>Detalhamento da fila</Text>
            <Text style={styles.value}>Pendentes: {counts.pending}</Text>
            <Text style={styles.value}>Enviando: {counts.syncing}</Text>
            <Text style={styles.value}>Falhas: {counts.failed}</Text>
            <Text style={styles.value}>Conflitos: {counts.conflict}</Text>
            {operations.map((operation) => {
              const row = (
                <>
                  <Text style={styles.operationTitle}>
                    {operationTypeLabel(operation.operationType)}
                    {__DEV__ && operation.operationType ? ` (${operation.operationType})` : ''}
                    {' · '}
                    <Text style={{ color: operationStatusColor(operation.status) }}>
                      {operationStatusLabel(operation.status)}
                    </Text>
                  </Text>
                  <Text style={styles.operationMeta}>
                    {new Date(operation.createdAt).toLocaleString('pt-BR')}
                  </Text>
                  {(operation.status === 'FAILED' || operation.status === 'CONFLICT') ? (
                    <Text style={[styles.operationMessage, { color: operationStatusColor(operation.status) }]}>
                      {humanizeSyncError(operation.lastError)}
                    </Text>
                  ) : null}
                  {operation.status === 'CONFLICT' ? (
                    <Text style={styles.conflictHint}>Toque para analisar</Text>
                  ) : null}
                  {__DEV__ ? (
                    <Text style={styles.devMeta}>
                      DEV: {operation.id.slice(0, 8)}… · Tentativas: {operation.attempts}
                      {operation.lastError ? ` · ${operation.lastError.slice(0, 200)}` : ''}
                    </Text>
                  ) : null}
                </>
              );

              if (operation.status === 'CONFLICT') {
                return (
                  <Pressable
                    key={operation.id}
                    accessibilityRole="button"
                    accessibilityLabel="Analisar conflito"
                    style={styles.operationRow}
                    onPress={() => router.push({
                      pathname: '/synchronization/conflict/[operationId]',
                      params: { operationId: operation.id },
                    })}
                  >
                    {row}
                    <Text style={styles.analyzeCta}>Analisar conflito</Text>
                  </Pressable>
                );
              }

              return <View key={operation.id} style={styles.operationRow}>{row}</View>;
            })}
          </Card>
        )}

        <Button label="Sincronizar agora" onPress={() => void sync()} loading={syncing} />
        {counts.failed > 0 ? (
          <Button
            label="Tentar novamente as falhas"
            variant="secondary"
            onPress={() => void retryFailed()}
            loading={syncing}
          />
        ) : null}

        <Text style={styles.warning}>
          Ordem: push da outbox, depois pull por cursor. O cursor só avança depois de gravar as mudanças localmente.
        </Text>

        {banner && banner.kind !== 'syncing' ? (
          <View style={styles.bannerBlock}>
            <Text style={bannerStyle}>{banner.message}</Text>
            {banner.showReauth ? (
              <Button
                label="Entrar novamente"
                variant="secondary"
                onPress={() => void signOut({ revokeRemote: false })}
              />
            ) : null}
          </View>
        ) : null}

        {__DEV__ ? (
          <View style={styles.developmentActions}>
            <Text style={styles.developmentLabel}>Cenários de desenvolvimento</Text>
            <Button
              label="Simular falha de envio"
              variant="secondary"
              onPress={() => void simulate('FAILED')}
              disabled={counts.total === 0}
            />
            <Button
              label="Simular conflito"
              variant="secondary"
              onPress={() => void simulate('CONFLICT')}
              disabled={counts.total === 0}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    padding: spacing.lg,
    paddingTop: spacing.xl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
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
  operationRow: {
    gap: 2,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  operationTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  operationMeta: { ...typography.caption, color: colors.textMuted },
  operationMessage: { ...typography.caption, lineHeight: 18 },
  conflictHint: { ...typography.caption, color: SYNC_WARNING_COLOR },
  analyzeCta: { ...typography.caption, color: colors.navy, fontWeight: '700', marginTop: 2 },
  devMeta: { ...typography.caption, color: colors.textMuted, opacity: 0.8 },
  developmentActions: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: spacing.md },
  developmentLabel: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase' },
  bannerBlock: { gap: spacing.sm },
  success: { ...typography.body, color: colors.success, textAlign: 'center' },
  partial: { ...typography.body, color: SYNC_WARNING_COLOR, textAlign: 'center' },
  error: { ...typography.body, color: colors.danger, textAlign: 'center' },
  warning: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
});
