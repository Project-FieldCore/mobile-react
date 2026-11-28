import {
  enqueueInspectionStart,
  getPendingOperations,
  hydrateInspectionDraft,
  removeDeliveredInspectionOperations,
  setEvidenceUploadStatus,
  recordConflictOperation,
  rekeySyncOperation,
  removeSyncOperation,
  replaceSyncOperationPayload,
  updateSyncOperation,
  type PendingOperation,
} from './draftStore';
import { processPendingOperations, type BatchSyncResult, type SendOutcome } from './batchSync';
import { pushMobileSyncOperations } from './syncPushApi';
import { mapSyncReceipt, toMobileSyncOperation, type AnswerSyncPayload } from './syncPushMapper';
import { createUuid, isUuid } from './uuid';
import { parseCompletionPayload } from './completionOutbox';
import { sendCompletionOperation, type SendCompletionDeps } from './completionFlow';
import { sendEvidenceOperation, type SendEvidenceDeps } from './evidenceSync';
import { sendStartOperation, ensureStartOperations, type SendStartDeps } from './startFlow';
import { isTerminalReceiptMessage, REJECTED_MESSAGE_PREFIX } from './syncErrorMessage';
import { inspectionStatusLabel } from './inspectionReviewUi';
import { completeAssignedInspection, fetchInspection, startAssignedInspection, uploadItemEvidence } from './executionApi';
import { markDownloadedInspectionStatus, saveDownloadedInspection } from './mockRepository';

const PUSHABLE_TYPES = new Set(['ANSWERS']);

function isLegacyCompletion(operation: PendingOperation): boolean {
  // Mock/legado: COMPLETE sem payload de conclusão não tem o que enviar.
  return parseCompletionPayload(operation.payload) === null;
}

async function ensureUuidOperationId(operation: PendingOperation): Promise<PendingOperation> {
  if (isUuid(operation.id)) return operation;
  const rekeyed = await rekeySyncOperation(operation.id, createUuid());
  return rekeyed ?? operation;
}

async function bumpSiblingAnswerVersions(inspectionId: string, nextBaseVersion: number, exceptId: string): Promise<void> {
  const operations = await getPendingOperations();
  await Promise.all(operations.map(async (operation) => {
    if (operation.id === exceptId) return;
    if (operation.inspectionId !== inspectionId || operation.operationType !== 'ANSWERS') return;
    if (operation.status !== 'PENDING' && operation.status !== 'FAILED') return;
    let payload: AnswerSyncPayload;
    try {
      payload = JSON.parse(operation.payload ?? '{}') as AnswerSyncPayload;
    } catch {
      return;
    }
    if (payload.baseVersion === nextBaseVersion) return;
    await replaceSyncOperationPayload(operation.id, { ...payload, baseVersion: nextBaseVersion });
  }));
}

const completionDeps: SendCompletionDeps = {
  fetchInspection,
  completeRemote: completeAssignedInspection,
  markSubmitted: (id) => markDownloadedInspectionStatus(id, 'SUBMITTED'),
  removeDeliveredOperations: removeDeliveredInspectionOperations,
};

const startDeps: SendStartDeps = {
  startRemote: startAssignedInspection,
  onStarted: async (inspection) => {
    await saveDownloadedInspection(inspection).catch(() => undefined);
    // O início incrementa a versão da inspeção: as respostas pendentes devem partir dela.
    await bumpSiblingAnswerVersions(inspection.id, inspection.version ?? 0, '');
  },
};

const evidenceDeps: SendEvidenceDeps = {
  getDraft: hydrateInspectionDraft,
  upload: uploadItemEvidence,
  setUploadStatus: setEvidenceUploadStatus,
};

export async function sendOutboxOperation(operation: PendingOperation): Promise<SendOutcome> {
  // Conclusão e evidências não passam pelo /mobile/sync/push (o servidor só aplica
  // INSPECTION_RESPONSE): usam os endpoints dedicados, respeitando a ordem da outbox
  // (início → respostas → localização → evidências → conclusão).
  if (operation.operationType === 'START') return sendStartOperation(operation, startDeps);
  if (operation.operationType === 'COMPLETE') {
    return isLegacyCompletion(operation) ? { kind: 'skipped' } : sendCompletionOperation(operation, completionDeps);
  }
  if (operation.operationType === 'EVIDENCE') return sendEvidenceOperation(operation, evidenceDeps);

  if (!PUSHABLE_TYPES.has(operation.operationType ?? '')) {
    // LOCATION: o push só aplica INSPECTION_RESPONSE; a localização segue na conclusão.
    return { kind: 'skipped' };
  }

  const withUuid = await ensureUuidOperationId(operation);
  const mobileOperation = toMobileSyncOperation(withUuid);
  if (!mobileOperation) {
    return { kind: 'failed', message: 'A operação de resposta está incompleta para o sync push.' };
  }

  const response = await pushMobileSyncOperations([mobileOperation]);
  const receipt = response.results.find((item) => item.operationId === mobileOperation.operationId) ?? response.results[0];
  if (!receipt) {
    return { kind: 'failed', message: 'O servidor não retornou recibo para a operação.' };
  }

  const outcome = mapSyncReceipt(receipt);
  if (outcome.kind === 'applied' && typeof receipt.entityVersion === 'number') {
    await bumpSiblingAnswerVersions(withUuid.inspectionId, receipt.entityVersion, withUuid.id);
  }
  if (outcome.kind === 'failed' && receipt.status === 'REJECTED') {
    return { kind: 'failed', message: await explainRejection(withUuid.inspectionId, outcome.message) };
  }
  return outcome;
}

/** O recibo REJECTED não traz motivo: consulta a inspeção para explicar (melhor esforço). */
async function explainRejection(inspectionId: string, fallback: string): Promise<string> {
  try {
    const server = await fetchInspection(inspectionId);
    if (!server) return `${REJECTED_MESSAGE_PREFIX}: a inspeção não foi encontrada no servidor.`;
    if (server.status !== 'IN_PROGRESS') {
      return `${REJECTED_MESSAGE_PREFIX}: a inspeção está "${inspectionStatusLabel(server.status)}" no servidor e só aceita respostas EM ANDAMENTO.`;
    }
  } catch {
    // sem detalhe adicional
  }
  return fallback;
}

/**
 * Um recibo REJECTED/DEPENDENCY_FAILED fica gravado no servidor para o operationId:
 * reenviar o mesmo id devolve ALREADY_APPLIED sem aplicar. Antes de retentar, a
 * operação recebe um novo operationId. Se a inspeção tem um START pendente (a causa
 * da rejeição), as operações FAILED dela voltam para PENDING e seguem no mesmo sync.
 */
export async function rekeyRejectedOperations(): Promise<number> {
  const operations = await getPendingOperations();
  const startPending = new Set(
    operations.filter((operation) => operation.operationType === 'START' && operation.status === 'PENDING')
      .map((operation) => operation.inspectionId),
  );
  let changed = 0;
  for (const operation of operations) {
    const requeue = operation.status === 'FAILED'
      && operation.operationType !== 'START'
      && startPending.has(operation.inspectionId);
    const rekey = operation.operationType === 'ANSWERS'
      && (operation.status === 'PENDING' || requeue)
      && isTerminalReceiptMessage(operation.lastError);
    if (!rekey && !requeue) continue;
    const id = rekey ? createUuid() : operation.id;
    if (rekey) await rekeySyncOperation(operation.id, id);
    if (requeue) await updateSyncOperation(id, 'PENDING', undefined, false);
    changed += 1;
  }
  return changed;
}

export async function runOutboxSync(): Promise<BatchSyncResult> {
  await ensureStartOperations({ getPendingOperations, fetchInspection, enqueueStart: enqueueInspectionStart }).catch(() => 0);
  await rekeyRejectedOperations();
  return processPendingOperations(
    {
      getPendingOperations,
      updateSyncOperation,
      removeSyncOperation,
      recordConflictOperation,
    },
    sendOutboxOperation,
  );
}
