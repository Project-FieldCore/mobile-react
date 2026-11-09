import { describe, expect, it, vi } from 'vitest';

import { orderPendingOperations, processPendingOperations } from './batchSync';
import type { PendingOperation } from './draftStore';

const operation = (id: string, inspectionId: string, operationType: string, createdAt: string): PendingOperation => ({
  id,
  inspectionId,
  operationType,
  createdAt,
  status: 'PENDING',
  attempts: 0,
});

describe('batchSync', () => {
  it('envia alterações de uma inspeção respeitando suas dependências', () => {
    const ordered = orderPendingOperations([
      operation('complete', 'A', 'COMPLETE', '2026-01-01T10:02:00Z'),
      operation('evidence', 'A', 'EVIDENCE', '2026-01-01T10:01:00Z'),
      operation('answers', 'A', 'ANSWERS', '2026-01-01T10:03:00Z'),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(['answers', 'evidence', 'complete']);
  });

  it('preserva pendências dependentes após uma falha parcial e processa outra inspeção', async () => {
    const operations = [
      operation('a-answers', 'A', 'ANSWERS', '2026-01-01T10:00:00Z'),
      operation('a-complete', 'A', 'COMPLETE', '2026-01-01T10:01:00Z'),
      operation('b-answers', 'B', 'ANSWERS', '2026-01-01T10:02:00Z'),
    ];
    const update = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const sender = vi.fn(async (item: PendingOperation) => {
      if (item.id === 'a-answers') throw new Error('Sem conexão');
    });

    const result = await processPendingOperations({
      getPendingOperations: vi.fn().mockResolvedValue(operations),
      updateSyncOperation: update,
      removeSyncOperation: remove,
    }, sender);

    expect(result).toEqual({ sent: 1, failed: 1, blocked: 1, conflicts: 0, skipped: 0 });
    expect(sender).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-answers' }));
    expect(sender).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'a-complete' }));
    expect(sender).toHaveBeenCalledWith(expect.objectContaining({ id: 'b-answers' }));
    expect(remove).toHaveBeenCalledWith('b-answers');
    expect(update).toHaveBeenCalledWith('a-answers', 'FAILED', 'Sem conexão');
  });

  it('marca CONFLICT sem remover e bloqueia a cadeia da inspeção', async () => {
    const operations = [
      operation('a-answers', 'A', 'ANSWERS', '2026-01-01T10:00:00Z'),
      operation('a-complete', 'A', 'COMPLETE', '2026-01-01T10:01:00Z'),
    ];
    const update = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);

    const result = await processPendingOperations({
      getPendingOperations: vi.fn().mockResolvedValue(operations),
      updateSyncOperation: update,
      removeSyncOperation: remove,
    }, async () => ({ kind: 'conflict', message: 'Conflito' }));

    expect(result).toEqual({ sent: 0, failed: 0, blocked: 1, conflicts: 1, skipped: 0 });
    expect(remove).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('a-answers', 'CONFLICT', 'Conflito');
  });

  it('mantém operações skipped na fila sem bloquear outras inspeções', async () => {
    const operations = [
      operation('a-location', 'A', 'LOCATION', '2026-01-01T10:00:00Z'),
      operation('b-answers', 'B', 'ANSWERS', '2026-01-01T10:01:00Z'),
    ];
    const update = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const sender = vi.fn(async (item: PendingOperation) => (
      item.operationType === 'LOCATION' ? { kind: 'skipped' as const } : { kind: 'applied' as const }
    ));

    const result = await processPendingOperations({
      getPendingOperations: vi.fn().mockResolvedValue(operations),
      updateSyncOperation: update,
      removeSyncOperation: remove,
    }, sender);

    expect(result).toEqual({ sent: 1, failed: 0, blocked: 0, conflicts: 0, skipped: 1 });
    expect(remove).toHaveBeenCalledWith('b-answers');
    expect(remove).not.toHaveBeenCalledWith('a-location');
    expect(update).toHaveBeenCalledWith('a-location', 'PENDING', undefined, false);
  });
});
