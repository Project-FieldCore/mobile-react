import {
  getPendingOperations,
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

const PUSHABLE_TYPES = new Set(['ANSWERS']);

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

export async function sendOutboxOperation(operation: PendingOperation): Promise<SendOutcome> {
  if (!PUSHABLE_TYPES.has(operation.operationType ?? '')) {
    // LOCATION / EVIDENCE / COMPLETE: o push só aplica INSPECTION_RESPONSE.
    // Permanecem na outbox para endpoints dedicados / PBIs seguintes.
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
  return outcome;
}

export async function runOutboxSync(): Promise<BatchSyncResult> {
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
