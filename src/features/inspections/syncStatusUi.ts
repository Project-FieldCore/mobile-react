import { colors } from '@/design-system/tokens';
import { ApiError } from '@/infrastructure/api/client';
import type { PendingOperation, SyncOperationStatus } from './draftStore';
import type { MobileSyncRunResult } from './runMobileSync';

export const SYNC_WARNING_COLOR = '#B7791F';

export type HomeChipTone = 'danger' | 'warning' | 'navy';

export type HomeChipModel = {
  title: string;
  actionLabel: string;
  tone: HomeChipTone;
  accessibilityLabel: string;
  subtitle?: string;
};

export type ListSyncIndicator = {
  caption: string;
  color: string;
  icon: 'cloud-upload-outline' | 'alert-circle' | 'warning-outline' | 'sync-outline';
};

export type SyncBannerKind = 'success' | 'partial' | 'error' | 'auth' | 'syncing';

export type SyncBannerModel = {
  kind: SyncBannerKind;
  message: string;
  showReauth?: boolean;
};

const OPERATION_TYPE_LABELS: Record<string, string> = {
  ANSWERS: 'Respostas',
  COMPLETE: 'Conclusão',
  UPSERT: 'Atualização',
  LOCATION: 'Localização',
  EVIDENCE: 'Evidência',
};

const STATUS_LABELS: Record<SyncOperationStatus, string> = {
  PENDING: 'Pendente',
  SYNCING: 'Enviando',
  FAILED: 'Falha',
  CONFLICT: 'Conflito',
};

const STATUS_COLORS: Record<SyncOperationStatus, string> = {
  PENDING: colors.textMuted,
  SYNCING: colors.navy,
  FAILED: colors.danger,
  CONFLICT: SYNC_WARNING_COLOR,
};

export function operationTypeLabel(operationType?: string): string {
  if (!operationType) return 'Alteração';
  return OPERATION_TYPE_LABELS[operationType] ?? 'Alteração';
}

export function operationStatusLabel(status: SyncOperationStatus): string {
  return STATUS_LABELS[status];
}

export function operationStatusColor(status: SyncOperationStatus): string {
  return STATUS_COLORS[status];
}

export function truncateMessage(message: string, max = 120): string {
  const trimmed = message.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function looksTechnical(raw: string): boolean {
  return /[{}\[\]\\]|stack|at\s+\S+\s*\(|SELECT\s|Bearer\s|requestId|ECONN|TypeError/i.test(raw);
}

export function humanizeSyncError(lastError?: string): string {
  if (!lastError?.trim()) return 'Não foi possível enviar esta alteração.';
  const raw = lastError.trim();

  if (/401|UNAUTHORIZED|sessão|sessao|expirad/i.test(raw)) {
    return 'Sessão expirada. Entre novamente para sincronizar.';
  }
  if (/403|FORBIDDEN|permiss/i.test(raw)) {
    return 'Você não tem permissão para sincronizar estes dados.';
  }
  if (/409|CONFLICT|conflit/i.test(raw)) {
    return 'Esta alteração conflita com o servidor. Os dados locais foram preservados.';
  }
  if (/rede|timeout|network|fetch failed|conectar ao servidor|excedeu 15/i.test(raw)) {
    return 'Sem conexão com o servidor. Tente de novo quando a rede voltar.';
  }
  if (/5\d\d|interno|temporár/i.test(raw)) {
    return 'Falha temporária no servidor. Tente novamente em instantes.';
  }
  if (looksTechnical(raw)) {
    return 'Não foi possível enviar esta alteração.';
  }
  if (/[\u00C0-\u024F]/.test(raw) || /^[A-Za-zÀ-ÿ0-9 ,.;:!?()\-']+$/.test(raw)) {
    return truncateMessage(raw, 120);
  }
  return 'Não foi possível enviar esta alteração.';
}

export function formatSyncInstant(iso: string | null | undefined): string {
  if (!iso) return 'Ainda não sincronizado';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR');
}

export function countByStatus(operations: PendingOperation[]) {
  return {
    pending: operations.filter((item) => item.status === 'PENDING').length,
    syncing: operations.filter((item) => item.status === 'SYNCING').length,
    failed: operations.filter((item) => item.status === 'FAILED').length,
    conflict: operations.filter((item) => item.status === 'CONFLICT').length,
    total: operations.length,
  };
}

export function buildHomeChip(counts: ReturnType<typeof countByStatus>): HomeChipModel | null {
  const { pending, failed, conflict } = counts;
  if (failed === 0 && conflict === 0 && pending === 0) return null;

  if (failed > 0) {
    const title = `${failed} falha(s) de sincronização`;
    return {
      title,
      actionLabel: 'Ver detalhes',
      tone: 'danger',
      accessibilityLabel: title,
      subtitle: pending > 0 ? `${pending} pendente(s)` : undefined,
    };
  }

  if (conflict > 0) {
    const title = `${conflict} conflito(s) de sincronização`;
    return {
      title,
      actionLabel: 'Ver detalhes',
      tone: 'warning',
      accessibilityLabel: title,
    };
  }

  const title = `${pending} pendência(s) de sincronização`;
  return {
    title,
    actionLabel: 'Sincronizar',
    tone: 'navy',
    accessibilityLabel: title,
  };
}

export function listSyncIndicatorForInspection(
  inspectionId: string,
  operations: PendingOperation[],
  inspectionStatus?: string,
): ListSyncIndicator | null {
  const related = operations.filter((item) => item.inspectionId === inspectionId);
  const hasFailed = related.some((item) => item.status === 'FAILED');
  const hasConflict = related.some((item) => item.status === 'CONFLICT');
  const hasSyncing = related.some((item) => item.status === 'SYNCING');
  const hasPending = related.some((item) => item.status === 'PENDING') || inspectionStatus === 'PENDING_SYNC';

  if (hasFailed) {
    return { caption: 'Falha na sincronização', color: STATUS_COLORS.FAILED, icon: 'alert-circle' };
  }
  if (hasConflict) {
    return { caption: 'Conflito na sincronização', color: STATUS_COLORS.CONFLICT, icon: 'warning-outline' };
  }
  if (hasSyncing) {
    return { caption: 'Enviando…', color: STATUS_COLORS.SYNCING, icon: 'sync-outline' };
  }
  if (hasPending) {
    return { caption: 'Aguardando sincronização', color: STATUS_COLORS.PENDING, icon: 'cloud-upload-outline' };
  }
  return null;
}

export function composeSyncSuccessBanner(result: MobileSyncRunResult): SyncBannerModel {
  const pushFailed = result.push.failed;
  const pushConflicts = result.push.conflicts;
  const pushParts = [
    result.push.sent ? `Envio: ${result.push.sent} enviada(s)` : 'Envio: nada pendente',
    pushConflicts ? `${pushConflicts} conflito(s)` : null,
    pushFailed ? `${pushFailed} falha(s) no envio` : null,
  ].filter(Boolean);

  const pullParts = [
    result.pull.applied.upsertedInspections ? `${result.pull.applied.upsertedInspections} inspeção(ões)` : null,
    result.pull.applied.upsertedResponses ? `${result.pull.applied.upsertedResponses} resposta(s)` : null,
    result.pull.applied.deletedInspections ? `${result.pull.applied.deletedInspections} remoção(ões)` : null,
  ].filter(Boolean);
  const pullText = result.pull.changes === 0
    ? 'Pull: sem mudanças novas'
    : `Pull: ${pullParts.join(', ') || `${result.pull.changes} mudança(s)`}`;

  const detail = [
    pushParts.join(' · '),
    pullText,
    result.pull.serverTime ? `Servidor: ${formatSyncInstant(result.pull.serverTime)}` : null,
  ].filter(Boolean).join(' · ');

  const partial = pushFailed > 0 || pushConflicts > 0;
  if (partial) {
    return {
      kind: 'partial',
      message: `Sincronização concluída com pendências. ${detail}`,
    };
  }
  return {
    kind: 'success',
    message: `Sincronização concluída. ${detail}`,
  };
}

export function composeSyncFailureBanner(error: unknown): SyncBannerModel {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.code === 'UNAUTHORIZED') {
      return {
        kind: 'auth',
        message: 'Sessão expirada. Entre novamente para sincronizar.',
        showReauth: true,
      };
    }
    if (error.status === 403 || error.code === 'FORBIDDEN') {
      return {
        kind: 'auth',
        message: 'Você não tem permissão para sincronizar estes dados.',
        showReauth: true,
      };
    }
    if (
      error.status == null
      || /conectar ao servidor|excedeu 15|rede|network/i.test(error.message)
    ) {
      return {
        kind: 'error',
        message: 'Não foi possível sincronizar agora. Verifique a conexão e tente novamente.',
      };
    }
  }

  if (error instanceof Error && /conectar ao servidor|excedeu 15|rede|network|fetch/i.test(error.message)) {
    return {
      kind: 'error',
      message: 'Não foi possível sincronizar agora. Verifique a conexão e tente novamente.',
    };
  }

  return {
    kind: 'error',
    message: 'Não foi possível sincronizar agora.',
  };
}
