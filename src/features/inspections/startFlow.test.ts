import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/infrastructure/api/client';
import { NETWORK_UNAVAILABLE_CODE } from '@/infrastructure/api/errorResponse';
import { orderPendingOperations, processPendingOperations, type BatchSyncStorage } from './batchSync';
import type { PendingOperation } from './draftStore';
import type { Inspection } from './mockRepository';
import { applyPendingCompletionStatus } from './completionOutbox';
import { ensureStartOperations, sendStartOperation, startInspectionOfflineFirst, type StartFlowDeps } from './startFlow';
import { describeSyncError } from './syncErrorMessage';

const ID = '11111111-1111-4111-8111-111111111111';
const inspection = (overrides: Partial<Inspection> = {}): Inspection => ({
  id: ID, client: 'C', site: 'S', equipment: 'E', scheduledAt: 'hoje', priority: 'HIGH',
  status: 'ASSIGNED', instructions: '', version: 0, ...overrides,
});
const networkError = () => new ApiError('sem rede', undefined, NETWORK_UNAVAILABLE_CODE);
const httpError = (status: number, code: string) => new ApiError('Inspection cannot be started', status, code, '/x');

const startOp = (overrides: Partial<PendingOperation> = {}): PendingOperation => ({
  id: 'start-op', inspectionId: ID, createdAt: '2026-01-01T10:00:00Z', status: 'PENDING', attempts: 0,
  operationType: 'START',
  payload: JSON.stringify({ kind: 'INSPECTION_START', v: 1, operationId: 'start-op', inspectionId: ID, startedAtDevice: '2026-01-01T09:00:00Z' }),
  ...overrides,
});
const op = (id: string, inspectionId: string, operationType: string, createdAt: string): PendingOperation => ({
  id, inspectionId, operationType, createdAt, status: 'PENDING', attempts: 0,
});

function flowDeps(overrides: Partial<StartFlowDeps> = {}): StartFlowDeps {
  return {
    getCachedInspection: vi.fn().mockResolvedValue(inspection()),
    startRemote: vi.fn().mockRejectedValue(networkError()),
    enqueueStart: vi.fn().mockResolvedValue('start-op'),
    saveInspection: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('início offline-first', () => {
  it('online: inicia no servidor e guarda o estado devolvido, sem enfileirar', async () => {
    const started = inspection({ status: 'IN_PROGRESS', version: 1 });
    const deps = flowDeps({ startRemote: vi.fn().mockResolvedValue(started) });
    await expect(startInspectionOfflineFirst(ID, 'now', undefined, deps)).resolves.toEqual({ queued: false });
    expect(deps.enqueueStart).not.toHaveBeenCalled();
    expect(deps.saveInspection).toHaveBeenCalledWith(started);
  });

  it('sem rede: enfileira START com localização e marca a cópia local EM ANDAMENTO', async () => {
    const deps = flowDeps();
    await expect(startInspectionOfflineFirst(ID, 'now', { latitude: 1, longitude: 2 }, deps)).resolves.toEqual({ queued: true });
    expect(deps.enqueueStart).toHaveBeenCalledWith(ID, expect.objectContaining({
      kind: 'INSPECTION_START', inspectionId: ID, startedAtDevice: 'now', latitude: 1, longitude: 2,
    }));
    expect(deps.saveInspection).toHaveBeenCalledWith(expect.objectContaining({ status: 'IN_PROGRESS' }));
  });

  it('sem rede e sem cópia baixada não abre a inspeção; erro de negócio não enfileira', async () => {
    await expect(startInspectionOfflineFirst(ID, 'now', undefined, flowDeps({ getCachedInspection: vi.fn().mockResolvedValue(null) })))
      .rejects.toThrow('sem uma cópia baixada');
    const business = flowDeps({ startRemote: vi.fn().mockRejectedValue(httpError(409, 'INSPECTION_NOT_STARTABLE')) });
    await expect(startInspectionOfflineFirst(ID, 'now', undefined, business)).rejects.toThrow('[INSPECTION_NOT_STARTABLE]');
    expect(business.enqueueStart).not.toHaveBeenCalled();
  });
});

describe('sync do START', () => {
  it('aplica com o operationId estável e repassa o estado do servidor (idempotente se já em andamento)', async () => {
    const startRemote = vi.fn().mockResolvedValue(inspection({ status: 'IN_PROGRESS', version: 3 }));
    const onStarted = vi.fn().mockResolvedValue(undefined);
    await expect(sendStartOperation(startOp(), { startRemote, onStarted })).resolves.toEqual({ kind: 'applied' });
    await expect(sendStartOperation(startOp(), { startRemote, onStarted })).resolves.toEqual({ kind: 'applied' });
    expect(startRemote).toHaveBeenNthCalledWith(1, ID, '2026-01-01T09:00:00Z', undefined, 'start-op');
    expect(startRemote).toHaveBeenNthCalledWith(2, ID, '2026-01-01T09:00:00Z', undefined, 'start-op');
    expect(onStarted).toHaveBeenCalledWith(expect.objectContaining({ version: 3 }));
  });

  it('409 INSPECTION_NOT_STARTABLE vira falha com mensagem útil; rede propaga', async () => {
    const onStarted = vi.fn();
    const business = await sendStartOperation(startOp(), { startRemote: vi.fn().mockRejectedValue(httpError(409, 'INSPECTION_NOT_STARTABLE')), onStarted });
    expect(business).toEqual({ kind: 'failed', message: expect.stringContaining('[INSPECTION_NOT_STARTABLE]') });
    expect(onStarted).not.toHaveBeenCalled();
    await expect(sendStartOperation(startOp(), { startRemote: vi.fn().mockRejectedValue(networkError()), onStarted }))
      .rejects.toBeInstanceOf(ApiError);
  });

  it('ensureStartOperations cria START só para inspeção ASSIGNED sem START na fila', async () => {
    const enqueueStart = vi.fn().mockResolvedValue('x');
    const other = '22222222-2222-4222-8222-222222222222';
    const operations = [
      op('a1', ID, 'ANSWERS', '2026-01-01T10:05:00Z'),
      op('a0', ID, 'COMPLETE', '2026-01-01T10:01:00Z'),
      op('b1', other, 'ANSWERS', '2026-01-01T10:02:00Z'),
      { ...startOp({ inspectionId: 'c' }), inspectionId: 'c' },
      op('c1', 'c', 'ANSWERS', '2026-01-01T10:03:00Z'),
    ];
    const fetchInspection = vi.fn(async (id: string) => inspection({ id, status: id === other ? 'IN_PROGRESS' : 'ASSIGNED' }));
    await expect(ensureStartOperations({ getPendingOperations: async () => operations, fetchInspection, enqueueStart })).resolves.toBe(1);
    expect(enqueueStart).toHaveBeenCalledTimes(1);
    expect(enqueueStart).toHaveBeenCalledWith(ID, expect.objectContaining({ startedAtDevice: '2026-01-01T10:01:00Z' }));
  });

  it('sem rede, ensureStartOperations não faz nada nem falha', async () => {
    const enqueueStart = vi.fn();
    await expect(ensureStartOperations({
      getPendingOperations: async () => [op('a1', ID, 'ANSWERS', 't')],
      fetchInspection: vi.fn().mockRejectedValue(networkError()),
      enqueueStart,
    })).resolves.toBe(0);
    expect(enqueueStart).not.toHaveBeenCalled();
  });
});

describe('ordem e bloqueio por inspeção', () => {
  it('ordena START → ANSWERS → LOCATION → EVIDENCE → COMPLETE por inspeção, sem misturar inspeções', () => {
    const ordered = orderPendingOperations([
      op('b-answers', 'B', 'ANSWERS', '2026-01-01T10:00:30Z'),
      op('a-complete', 'A', 'COMPLETE', '2026-01-01T10:00:01Z'),
      op('a-evidence', 'A', 'EVIDENCE', '2026-01-01T10:00:02Z'),
      op('a-location', 'A', 'LOCATION', '2026-01-01T10:00:03Z'),
      op('a-answers', 'A', 'ANSWERS', '2026-01-01T10:00:04Z'),
      op('a-start', 'A', 'START', '2026-01-01T10:00:09Z'),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['a-start', 'a-answers', 'a-location', 'a-evidence', 'a-complete', 'b-answers']);
  });

  function storage(operations: PendingOperation[]): BatchSyncStorage {
    return {
      getPendingOperations: vi.fn().mockResolvedValue(operations),
      updateSyncOperation: vi.fn().mockResolvedValue(undefined),
      removeSyncOperation: vi.fn().mockResolvedValue(undefined),
      recordConflictOperation: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('falha ou conflito de uma inspeção não bloqueia as demais; START falho bloqueia só a própria', async () => {
    const ops = [
      op('old-conflict', 'OLD', 'ANSWERS', '2026-01-01T09:00:00Z'),
      op('a-start', 'A', 'START', '2026-01-01T10:00:00Z'),
      op('a-answers', 'A', 'ANSWERS', '2026-01-01T10:00:01Z'),
      op('b-start', 'B', 'START', '2026-01-01T10:01:00Z'),
      op('b-answers', 'B', 'ANSWERS', '2026-01-01T10:01:01Z'),
    ];
    const send = vi.fn(async (item: PendingOperation) => {
      if (item.id === 'old-conflict') return { kind: 'conflict' as const };
      if (item.id === 'a-start') return { kind: 'failed' as const, message: 'x' };
      return { kind: 'applied' as const };
    });
    const result = await processPendingOperations(storage(ops), send);
    expect(result).toEqual({ sent: 2, failed: 1, blocked: 1, conflicts: 1, skipped: 0 });
    expect(send.mock.calls.map(([item]) => item.id)).toEqual(['old-conflict', 'a-start', 'b-start', 'b-answers']);
  });

  it('sem rede interrompe o lote: tudo continua PENDING e sem tentativas extras', async () => {
    const ops = [op('a', 'A', 'START', '2026-01-01T10:00:00Z'), op('b', 'B', 'START', '2026-01-01T10:01:00Z')];
    const store = storage(ops);
    const send = vi.fn().mockRejectedValue(networkError());
    const result = await processPendingOperations(store, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ failed: 1, blocked: 1 });
    expect(store.updateSyncOperation).toHaveBeenCalledWith('a', 'PENDING', expect.any(String));
  });
});

describe('mensagens e estado local', () => {
  it('describeSyncError traduz código conhecido e preserva código/mensagem desconhecidos', () => {
    expect(describeSyncError(httpError(409, 'INSPECTION_NOT_IN_PROGRESS'))).toBe('A inspeção não está em andamento no servidor. [INSPECTION_NOT_IN_PROGRESS]');
    expect(describeSyncError(new ApiError('Boom', 500, 'OUTRO'))).toBe('Boom [OUTRO]');
    expect(describeSyncError(new Error('Sem conexão'))).toBe('Sem conexão');
  });

  it('START pendente mostra a inspeção ATRIBUÍDA como EM ANDAMENTO; conclusão pendente prevalece', () => {
    expect(applyPendingCompletionStatus([inspection()], [startOp()])[0].status).toBe('IN_PROGRESS');
    expect(applyPendingCompletionStatus([inspection()], [])[0].status).toBe('ASSIGNED');
  });
});
