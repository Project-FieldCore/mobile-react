import { isNetworkUnavailableError } from '@/infrastructure/api/errorResponse';
import { describeSyncError } from './syncErrorMessage';
import type { ConflictServerSnapshot, PendingOperation, SyncOperationStatus } from './draftStore';

export type BatchSyncResult = {
  sent: number;
  failed: number;
  blocked: number;
  conflicts: number;
  skipped: number;
};

export type BatchSyncStorage = {
  getPendingOperations: () => Promise<PendingOperation[]>;
  updateSyncOperation: (
    id: string,
    status: SyncOperationStatus,
    lastError?: string,
    bumpAttempts?: boolean,
  ) => Promise<void>;
  removeSyncOperation: (id: string) => Promise<void>;
  recordConflictOperation: (
    id: string,
    lastError: string,
    entityVersion: number | null | undefined,
    server: ConflictServerSnapshot | null | undefined,
  ) => Promise<void>;
};

export type SendOutcome =
  | { kind: 'applied' }
  | {
    kind: 'conflict';
    message?: string;
    entityVersion?: number | null;
    server?: ConflictServerSnapshot | null;
  }
  | { kind: 'failed'; message: string }
  | { kind: 'skipped' };

export type OperationSender = (operation: PendingOperation) => Promise<void | SendOutcome>;

/** Ordem dentro de uma inspeção: START → ANSWERS → LOCATION → EVIDENCE → COMPLETE. */
const operationOrder: Record<string, number> = {
  START: 0,
  ANSWERS: 1,
  LOCATION: 2,
  EVIDENCE: 3,
  COMPLETE: 4,
};

/**
 * Agrupa por inspeção (grupos na ordem da operação mais antiga de cada uma) e,
 * dentro do grupo, aplica a ordem de dependência do servidor.
 */
export function orderPendingOperations(operations: PendingOperation[]): PendingOperation[] {
  const pending = operations.filter((operation) => operation.status === 'PENDING');
  const firstSeen = new Map<string, string>();
  for (const operation of pending) {
    const current = firstSeen.get(operation.inspectionId);
    if (current === undefined || operation.createdAt < current) firstSeen.set(operation.inspectionId, operation.createdAt);
  }
  return pending.sort((left, right) => {
    if (left.inspectionId !== right.inspectionId) {
      const byGroup = (firstSeen.get(left.inspectionId) ?? '').localeCompare(firstSeen.get(right.inspectionId) ?? '');
      return byGroup !== 0 ? byGroup : left.inspectionId.localeCompare(right.inspectionId);
    }
    const order = (operationOrder[left.operationType ?? ''] ?? 0) - (operationOrder[right.operationType ?? ''] ?? 0);
    return order !== 0 ? order : left.createdAt.localeCompare(right.createdAt);
  });
}

function normalizeOutcome(result: void | SendOutcome): SendOutcome {
  return result ?? { kind: 'applied' };
}

/**
 * Envia a fila preservando a ordem de cada inspeção. Se uma operação falha,
 * as próximas da mesma inspeção ficam pendentes e as demais inspeções seguem
 * (conflito/falha de uma inspeção nunca bloqueia outra). Sem rede, interrompe o
 * lote: o restante continua PENDING, sem esperar um timeout por operação.
 */
export async function processPendingOperations(
  storage: BatchSyncStorage,
  send: OperationSender,
): Promise<BatchSyncResult> {
  const operations = orderPendingOperations(await storage.getPendingOperations());
  const blockedInspections = new Set<string>();
  const result: BatchSyncResult = { sent: 0, failed: 0, blocked: 0, conflicts: 0, skipped: 0 };

  let offline = false;

  for (const operation of operations) {
    if (offline || blockedInspections.has(operation.inspectionId)) {
      result.blocked += 1;
      continue;
    }

    await storage.updateSyncOperation(operation.id, 'SYNCING', undefined, false);
    try {
      const outcome = normalizeOutcome(await send(operation));
      if (outcome.kind === 'applied') {
        await storage.removeSyncOperation(operation.id);
        result.sent += 1;
        continue;
      }
      if (outcome.kind === 'skipped') {
        await storage.updateSyncOperation(operation.id, 'PENDING', undefined, false);
        result.skipped += 1;
        continue;
      }
      if (outcome.kind === 'conflict') {
        await storage.recordConflictOperation(
          operation.id,
          outcome.message ?? 'A versão local diverge da versão no servidor.',
          outcome.entityVersion,
          outcome.server,
        );
        blockedInspections.add(operation.inspectionId);
        result.conflicts += 1;
        continue;
      }
      await storage.updateSyncOperation(operation.id, 'FAILED', outcome.message);
      blockedInspections.add(operation.inspectionId);
      result.failed += 1;
    } catch (error) {
      const message = describeSyncError(error, 'Não foi possível enviar a operação.');
      // Sem rede não é falha da operação: continua PENDING e sai no próximo sync, sem exigir "Tentar novamente".
      const networkDown = isNetworkUnavailableError(error);
      await storage.updateSyncOperation(operation.id, networkDown ? 'PENDING' : 'FAILED', message);
      if (networkDown) offline = true;
      blockedInspections.add(operation.inspectionId);
      result.failed += 1;
    }
  }

  return result;
}
