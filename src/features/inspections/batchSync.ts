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

const operationOrder: Record<string, number> = {
  ANSWERS: 1,
  LOCATION: 2,
  EVIDENCE: 3,
  COMPLETE: 4,
};

function compareOperations(left: PendingOperation, right: PendingOperation): number {
  if (left.inspectionId === right.inspectionId) {
    const order = (operationOrder[left.operationType ?? ''] ?? 0) - (operationOrder[right.operationType ?? ''] ?? 0);
    if (order !== 0) return order;
  }
  return left.createdAt.localeCompare(right.createdAt);
}

export function orderPendingOperations(operations: PendingOperation[]): PendingOperation[] {
  return operations
    .filter((operation) => operation.status === 'PENDING')
    .sort(compareOperations);
}

function normalizeOutcome(result: void | SendOutcome): SendOutcome {
  return result ?? { kind: 'applied' };
}

/**
 * Envia a fila preservando a ordem de cada inspeção. Se uma operação falha,
 * as próximas da mesma inspeção ficam pendentes e as demais inspeções seguem.
 */
export async function processPendingOperations(
  storage: BatchSyncStorage,
  send: OperationSender,
): Promise<BatchSyncResult> {
  const operations = orderPendingOperations(await storage.getPendingOperations());
  const blockedInspections = new Set<string>();
  const result: BatchSyncResult = { sent: 0, failed: 0, blocked: 0, conflicts: 0, skipped: 0 };

  for (const operation of operations) {
    if (blockedInspections.has(operation.inspectionId)) {
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
      const message = error instanceof Error ? error.message : 'Não foi possível enviar a operação.';
      await storage.updateSyncOperation(operation.id, 'FAILED', message);
      blockedInspections.add(operation.inspectionId);
      result.failed += 1;
    }
  }

  return result;
}
