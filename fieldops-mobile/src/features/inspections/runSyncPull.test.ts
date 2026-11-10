import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/infrastructure/api/client';
import { pullMobileSyncChanges } from './syncPullApi';
import { applyPullChanges } from './syncPullApply';
import { getLastPullCursor, setLastPullCursor, setLastPullServerTime } from './syncCursorStore';
import { runSyncPull } from './runSyncPull';

vi.mock('./syncPullApi', () => ({ pullMobileSyncChanges: vi.fn() }));
vi.mock('./syncPullApply', () => ({
  applyPullChanges: vi.fn().mockResolvedValue({
    upsertedInspections: 0,
    upsertedResponses: 0,
    deletedInspections: 0,
  }),
}));
vi.mock('./syncCursorStore', () => ({
  getLastPullCursor: vi.fn(),
  setLastPullCursor: vi.fn().mockResolvedValue(undefined),
  setLastPullServerTime: vi.fn().mockResolvedValue(undefined),
}));

const mockedPull = pullMobileSyncChanges as unknown as ReturnType<typeof vi.fn>;
const mockedApply = applyPullChanges as unknown as ReturnType<typeof vi.fn>;
const mockedGetCursor = getLastPullCursor as unknown as ReturnType<typeof vi.fn>;
const mockedSetCursor = setLastPullCursor as unknown as ReturnType<typeof vi.fn>;
const mockedSetServerTime = setLastPullServerTime as unknown as ReturnType<typeof vi.fn>;

describe('runSyncPull', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCursor.mockResolvedValue(null);
    mockedApply.mockResolvedValue({
      upsertedInspections: 1,
      upsertedResponses: 0,
      deletedInspections: 0,
    });
  });

  it('avança o cursor só depois de persistir a página e itera hasMore', async () => {
    const order: string[] = [];
    mockedApply.mockImplementation(async () => {
      order.push('apply');
      return { upsertedInspections: 1, upsertedResponses: 0, deletedInspections: 0 };
    });
    mockedSetCursor.mockImplementation(async (cursor: string) => {
      order.push(`cursor:${cursor}`);
    });

    mockedPull
      .mockResolvedValueOnce({
        changes: [{ entityType: 'INSPECTION', entityId: 'a', operation: 'UPSERT', updatedAt: '2026-01-01T00:00:00Z', payload: null }],
        nextCursor: 'cursor-1',
        serverTime: '2026-01-01T00:00:01Z',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        changes: [],
        nextCursor: 'cursor-2',
        serverTime: '2026-01-01T00:00:02Z',
        hasMore: false,
      });

    const result = await runSyncPull();

    expect(mockedPull).toHaveBeenNthCalledWith(1, null);
    expect(mockedPull).toHaveBeenNthCalledWith(2, 'cursor-1');
    expect(order).toEqual(['apply', 'cursor:cursor-1', 'apply', 'cursor:cursor-2']);
    expect(mockedSetServerTime).toHaveBeenLastCalledWith('2026-01-01T00:00:02Z');
    expect(result).toEqual(expect.objectContaining({
      pages: 2,
      changes: 1,
      hasMoreStopped: false,
      serverTime: '2026-01-01T00:00:02Z',
    }));
  });

  it('poll quieto (vazio / hasMore=false) ainda grava cursor e serverTime', async () => {
    mockedPull.mockResolvedValueOnce({
      changes: [],
      nextCursor: 'quiet-cursor',
      serverTime: '2026-01-01T12:00:00Z',
      hasMore: false,
    });
    mockedApply.mockResolvedValueOnce({
      upsertedInspections: 0,
      upsertedResponses: 0,
      deletedInspections: 0,
    });

    const result = await runSyncPull();

    expect(result.changes).toBe(0);
    expect(mockedSetCursor).toHaveBeenCalledWith('quiet-cursor');
    expect(mockedSetServerTime).toHaveBeenCalledWith('2026-01-01T12:00:00Z');
  });

  it('não avança cursor quando o pull falha (401/malformed)', async () => {
    mockedPull.mockRejectedValueOnce(new ApiError('Não autorizado.', 401, 'UNAUTHORIZED'));

    await expect(runSyncPull()).rejects.toMatchObject({ status: 401 });
    expect(mockedApply).not.toHaveBeenCalled();
    expect(mockedSetCursor).not.toHaveBeenCalled();
  });

  it('não avança cursor se a persistência da página falhar', async () => {
    mockedPull.mockResolvedValueOnce({
      changes: [{ entityType: 'INSPECTION', entityId: 'a', operation: 'UPSERT', updatedAt: '2026-01-01T00:00:00Z', payload: null }],
      nextCursor: 'should-not-save',
      serverTime: '2026-01-01T00:00:01Z',
      hasMore: false,
    });
    mockedApply.mockRejectedValueOnce(new Error('disco cheio'));

    await expect(runSyncPull()).rejects.toThrow('disco cheio');
    expect(mockedSetCursor).not.toHaveBeenCalled();
  });
});
