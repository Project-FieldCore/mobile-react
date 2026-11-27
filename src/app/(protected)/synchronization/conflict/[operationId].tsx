import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, colors, ErrorState, LoadingState, spacing, typography } from '@/design-system';
import { ApiError } from '@/infrastructure/api/client';
import { getSyncOperationById, type PendingOperation } from '@/features/inspections/draftStore';
import {
  canKeepLocal,
  formatLocalConflictValue,
  formatServerConflictValue,
  valuesDiffer,
  versionLine,
} from '@/features/inspections/conflictAnalysisUi';
import {
  resolveConflictAdoptServer,
  resolveConflictKeepLocalAndPush,
} from '@/features/inspections/conflictResolve';
import { operationTypeLabel } from '@/features/inspections/syncStatusUi';
import { parseAnswerSyncPayload } from '@/features/inspections/syncPushMapper';

const WARNING = '#B7791F';

export default function ConflictAnalysisScreen() {
  const { operationId } = useLocalSearchParams<{ operationId: string }>();
  const [operation, setOperation] = useState<PendingOperation | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<'success' | 'error' | 'info'>('info');

  const load = useCallback(async () => {
    setLoading(true);
    setMissing(false);
    try {
      const next = await getSyncOperationById(operationId);
      if (!next || next.status !== 'CONFLICT') {
        setMissing(true);
        setOperation(null);
      } else {
        setOperation(next);
      }
    } catch {
      setMissing(true);
    } finally {
      setLoading(false);
    }
  }, [operationId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) return <LoadingState title="Carregando conflito..." />;
  if (missing || !operation) {
    return (
      <ErrorState
        title="Conflito não encontrado"
        description="A operação pode ter sido resolvida ou removida."
        onRetry={() => router.back()}
      />
    );
  }

  const localPayload = parseAnswerSyncPayload(operation.payload);
  const local = formatLocalConflictValue(localPayload);
  const server = formatServerConflictValue(operation.conflictServer);
  const differ = valuesDiffer(local, server);
  const keepEnabled = canKeepLocal(operation.conflictEntityVersion) && !resolving;

  const keepLocal = async () => {
    setResolving(true);
    setNotice('Aplicando sua escolha…');
    setNoticeTone('info');
    try {
      const result = await resolveConflictKeepLocalAndPush(operation.id);
      if (result.kind === 'applied') {
        setNoticeTone('success');
        setNotice('Alteração local enviada.');
        setTimeout(() => router.back(), 500);
        return;
      }
      if (result.kind === 'conflict') {
        setOperation(result.operation);
        setNoticeTone('error');
        setNotice('Ainda há conflito. Atualize e tente de novo.');
        return;
      }
      setNoticeTone('error');
      setNotice(result.message.includes('conexão') || result.message.includes('servidor')
        ? 'Não foi possível concluir agora. Verifique a conexão.'
        : result.message);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.code === 'UNAUTHORIZED')) {
        setNotice('Sessão expirada. Entre novamente para continuar.');
      } else if (error instanceof Error && error.message.includes('Versão do servidor')) {
        setNotice(error.message);
      } else {
        setNotice('Não foi possível concluir agora. Verifique a conexão.');
      }
      setNoticeTone('error');
      await load();
    } finally {
      setResolving(false);
    }
  };

  const adoptServer = async () => {
    setResolving(true);
    setNotice('Aplicando sua escolha…');
    setNoticeTone('info');
    try {
      await resolveConflictAdoptServer(operation.id);
      setNoticeTone('success');
      setNotice('Valor do servidor aplicado neste dispositivo.');
      setTimeout(() => router.back(), 500);
    } catch {
      setNoticeTone('error');
      setNotice('Não foi possível concluir agora. Verifique a conexão.');
      await load();
    } finally {
      setResolving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Conflito de versão</Text>
        <Text style={styles.subtitle}>A alteração neste dispositivo foi preservada.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.meta}>
          {operationTypeLabel(operation.operationType)} · {new Date(operation.createdAt).toLocaleString('pt-BR')}
        </Text>
        <Text style={styles.meta}>{versionLine(operation.conflictEntityVersion)}</Text>
        {!canKeepLocal(operation.conflictEntityVersion) ? (
          <Text style={styles.bannerWarn}>Versão do servidor indisponível; sincronize de novo.</Text>
        ) : null}

        <Card style={styles.sideCard}>
          <View style={styles.sideHeader}>
            <Ionicons name="phone-portrait-outline" size={16} color={colors.navy} />
            <Text style={[styles.sideTitle, { color: colors.navy }]}>No dispositivo</Text>
          </View>
          <Text style={[styles.sideValue, differ ? styles.diffValue : null]}>{local.primary}</Text>
          <Text style={styles.sideObs}>Obs.: {local.observation ?? '—'}</Text>
        </Card>

        <Card style={styles.sideCard}>
          <View style={styles.sideHeader}>
            <Ionicons name="cloud-outline" size={16} color={WARNING} />
            <Text style={[styles.sideTitle, { color: WARNING }]}>No servidor</Text>
          </View>
          <Text style={[styles.sideValue, differ ? styles.diffValue : null]}>{server.primary}</Text>
          <Text style={styles.sideObs}>Obs.: {server.observation ?? '—'}</Text>
        </Card>

        {__DEV__ ? (
          <Text style={styles.dev}>
            DEV: {operation.id} · entityVersion={String(operation.conflictEntityVersion)} · server.id={operation.conflictServer?.id ?? '—'}
          </Text>
        ) : null}

        <Button
          label="Manter local e reenviar"
          onPress={() => void keepLocal()}
          loading={resolving}
          disabled={!keepEnabled}
        />
        <Button
          label="Usar valor do servidor"
          variant="secondary"
          onPress={() => void adoptServer()}
          loading={resolving}
          disabled={resolving}
        />
        <Button
          label="Cancelar"
          variant="secondary"
          onPress={() => router.back()}
          disabled={resolving}
        />

        <Text style={styles.footer}>
          O servidor não aplicou esta alteração. Você escolhe o que prevalece.
        </Text>
        {notice ? (
          <Text style={noticeTone === 'success' ? styles.success : noticeTone === 'error' ? styles.error : styles.meta}>
            {notice}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: spacing.xs,
  },
  title: { ...typography.title, color: colors.textOnDark },
  subtitle: { ...typography.body, color: colors.textOnDark, opacity: 0.85 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  meta: { ...typography.caption, color: colors.textMuted },
  bannerWarn: { ...typography.body, color: WARNING },
  sideCard: { gap: spacing.xs },
  sideHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sideTitle: { ...typography.subtitle },
  sideValue: { ...typography.title, fontSize: 22, color: colors.text },
  diffValue: { color: colors.danger },
  sideObs: { ...typography.body, color: colors.textMuted },
  footer: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  success: { ...typography.body, color: colors.success, textAlign: 'center' },
  error: { ...typography.body, color: colors.danger, textAlign: 'center' },
  dev: { ...typography.caption, color: colors.textMuted },
});
