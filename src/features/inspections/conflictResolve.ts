import {
  clearConflictMetadata,
  getSyncOperationById,
  mergeServerAnswers,
  recordConflictOperation,
  removeSyncOperation,
  replaceSyncOperationPayload,
  updateSyncOperation,
  type ConflictServerSnapshot,
  type PendingOperation,
} from './draftStore';
import { formatServerConflictValue } from './conflictAnalysisUi';
import { sendOutboxOperation } from './runOutboxSync';
import { parseAnswerSyncPayload } from './syncPushMapper';

export type ResolveKeepLocalResult =
  | { kind: 'applied' }
  | { kind: 'conflict'; operation: PendingOperation }
  | { kind: 'failed'; message: string };

function serverSnapshotToAnswer(server: ConflictServerSnapshot | null | undefined): {
  answer: string | null;
  observation?: string;
} {
  const formatted = formatServerConflictValue(server);
  if (formatted.empty) return { answer: null, observation: server?.observation ?? undefined };
  return {
    answer: formatted.primary,
    observation: server?.observation ?? undefined,
  };
}

/** Bumps baseVersion to server entityVersion and requeues the same operationId. */
export async function prepareConflictKeepLocal(operationId: string): Promise<PendingOperation> {
  const operation = await getSyncOperationById(operationId);
  if (!operation || operation.status !== 'CONFLICT') {
    throw new Error('Conflito não encontrado');
  }
  if (typeof operation.conflictEntityVersion !== 'number') {
    throw new Error('Versão do servidor indisponível; sincronize de novo.');
  }

  const payload = parseAnswerSyncPayload(operation.payload);
  if (!payload) {
    throw new Error('A operação de resposta está incompleta.');
  }

  await replaceSyncOperationPayload(operationId, {
    ...payload,
    baseVersion: operation.conflictEntityVersion,
  });
  await clearConflictMetadata(operationId);
  await updateSyncOperation(operationId, 'PENDING', undefined, false);

  const refreshed = await getSyncOperationById(operationId);
  if (!refreshed) throw new Error('Conflito não encontrado');
  return refreshed;
}

export async function resolveConflictKeepLocalAndPush(operationId: string): Promise<ResolveKeepLocalResult> {
  const pending = await prepareConflictKeepLocal(operationId);
  const outcome = await sendOutboxOperation(pending);

  if (outcome.kind === 'applied') {
    await removeSyncOperation(pending.id);
    return { kind: 'applied' };
  }

  if (outcome.kind === 'conflict') {
    await recordConflictOperation(
      pending.id,
      outcome.message ?? 'Ainda há conflito. Atualize e tente de novo.',
      outcome.entityVersion,
      outcome.server,
    );
    const refreshed = await getSyncOperationById(pending.id);
    return { kind: 'conflict', operation: refreshed ?? pending };
  }

  const message = outcome.kind === 'failed'
    ? outcome.message
    : 'Não foi possível concluir agora. Verifique a conexão.';
  await updateSyncOperation(pending.id, 'PENDING', message, false);
  return { kind: 'failed', message };
}

/** Applies server snapshot into the local draft and removes the conflicted outbox op. */
export async function resolveConflictAdoptServer(operationId: string): Promise<void> {
  const operation = await getSyncOperationById(operationId);
  if (!operation || operation.status !== 'CONFLICT') {
    throw new Error('Conflito não encontrado');
  }

  const payload = parseAnswerSyncPayload(operation.payload);
  if (!payload?.inspectionItemId) {
    throw new Error('A operação de resposta está incompleta.');
  }

  const { answer, observation } = serverSnapshotToAnswer(operation.conflictServer);
  if (answer) {
    await mergeServerAnswers(
      operation.inspectionId,
      { [payload.inspectionItemId]: answer },
      observation,
      operation.conflictEntityVersion ?? undefined,
    );
  } else if (typeof operation.conflictEntityVersion === 'number') {
    await mergeServerAnswers(
      operation.inspectionId,
      {},
      observation,
      operation.conflictEntityVersion,
    );
  }

  await removeSyncOperation(operationId);
}
