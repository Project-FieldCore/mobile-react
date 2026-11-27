import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearConflictMetadata,
  getSyncOperationById,
  mergeServerAnswers,
  recordConflictOperation,
  removeSyncOperation,
  replaceSyncOperationPayload,
  updateSyncOperation,
  type PendingOperation,
} from './draftStore';
import { sendOutboxOperation } from './runOutboxSync';
import { prepareConflictKeepLocal, resolveConflictAdoptServer, resolveConflictKeepLocalAndPush } from './conflictResolve';

vi.mock('./draftStore', () => ({
  clearConflictMetadata: vi.fn().mockResolvedValue(undefined),
  getSyncOperationById: vi.fn(),
  mergeServerAnswers: vi.fn().mockResolvedValue(undefined),
  recordConflictOperation: vi.fn().mockResolvedValue(undefined),
  removeSyncOperation: vi.fn().mockResolvedValue(undefined),
  replaceSyncOperationPayload: vi.fn().mockResolvedValue(undefined),
  updateSyncOperation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./runOutboxSync', () => ({
  sendOutboxOperation: vi.fn(),
}));

const mockedGet = getSyncOperationById as unknown as ReturnType<typeof vi.fn>;
const mockedReplace = replaceSyncOperationPayload as unknown as ReturnType<typeof vi.fn>;
const mockedClear = clearConflictMetadata as unknown as ReturnType<typeof vi.fn>;
const mockedUpdate = updateSyncOperation as unknown as ReturnType<typeof vi.fn>;
const mockedSend = sendOutboxOperation as unknown as ReturnType<typeof vi.fn>;
const mockedRemove = removeSyncOperation as unknown as ReturnType<typeof vi.fn>;
const mockedMerge = mergeServerAnswers as unknown as ReturnType<typeof vi.fn>;
const mockedRecord = recordConflictOperation as unknown as ReturnType<typeof vi.fn>;

const conflictOp = (): PendingOperation => ({
  id: '11111111-1111-4111-8111-111111111111',
  inspectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  createdAt: '2026-01-01T10:00:00Z',
  status: 'CONFLICT',
  attempts: 1,
  operationType: 'ANSWERS',
  payload: JSON.stringify({
    entityId: '22222222-2222-4222-8222-222222222222',
    inspectionItemId: '33333333-3333-4333-8333-333333333333',
    baseVersion: 0,
    valueBoolean: true,
    observation: 'local',
  }),
  conflictEntityVersion: 4,
  conflictServer: { valueBoolean: false, observation: 'server' },
  lastError: 'Conflito',
});

describe('conflictResolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepareConflictKeepLocal bumpa baseVersion e requeue PENDING', async () => {
    const op = conflictOp();
    mockedGet
      .mockResolvedValueOnce(op)
      .mockResolvedValueOnce({ ...op, status: 'PENDING', conflictEntityVersion: null, conflictServer: null });

    const result = await prepareConflictKeepLocal(op.id);

    expect(mockedReplace).toHaveBeenCalledWith(op.id, expect.objectContaining({ baseVersion: 4, valueBoolean: true }));
    expect(mockedClear).toHaveBeenCalledWith(op.id);
    expect(mockedUpdate).toHaveBeenCalledWith(op.id, 'PENDING', undefined, false);
    expect(result.status).toBe('PENDING');
  });

  it('prepareConflictKeepLocal falha sem entityVersion', async () => {
    mockedGet.mockResolvedValueOnce({ ...conflictOp(), conflictEntityVersion: null });
    await expect(prepareConflictKeepLocal('x')).rejects.toThrow(/Versão do servidor indisponível/);
  });

  it('resolveConflictKeepLocalAndPush remove em APPLIED', async () => {
    const op = conflictOp();
    mockedGet
      .mockResolvedValueOnce(op)
      .mockResolvedValueOnce({ ...op, status: 'PENDING' });
    mockedSend.mockResolvedValueOnce({ kind: 'applied' });

    await expect(resolveConflictKeepLocalAndPush(op.id)).resolves.toEqual({ kind: 'applied' });
    expect(mockedRemove).toHaveBeenCalledWith(op.id);
  });

  it('resolveConflictKeepLocalAndPush re-persiste CONFLICT se o recibo continuar em conflito', async () => {
    const op = conflictOp();
    mockedGet
      .mockResolvedValueOnce(op)
      .mockResolvedValueOnce({ ...op, status: 'PENDING' })
      .mockResolvedValueOnce(op);
    mockedSend.mockResolvedValueOnce({
      kind: 'conflict',
      message: 'Ainda há conflito',
      entityVersion: 5,
      server: { valueText: 'novo' },
    });

    const result = await resolveConflictKeepLocalAndPush(op.id);
    expect(result.kind).toBe('conflict');
    expect(mockedRecord).toHaveBeenCalledWith(op.id, 'Ainda há conflito', 5, { valueText: 'novo' });
  });

  it('resolveConflictAdoptServer aplica snapshot e remove a operação', async () => {
    mockedGet.mockResolvedValueOnce(conflictOp());
    await resolveConflictAdoptServer(conflictOp().id);
    expect(mockedMerge).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      { '33333333-3333-4333-8333-333333333333': 'Não' },
      'server',
      4,
    );
    expect(mockedRemove).toHaveBeenCalled();
  });
});
