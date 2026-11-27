import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runOutboxSync } from './runOutboxSync';
import { runSyncPull } from './runSyncPull';
import { setLastSyncAt } from './syncCursorStore';
import { runMobileSync } from './runMobileSync';

vi.mock('./runOutboxSync', () => ({ runOutboxSync: vi.fn() }));
vi.mock('./runSyncPull', () => ({ runSyncPull: vi.fn() }));
vi.mock('./syncCursorStore', () => ({ setLastSyncAt: vi.fn().mockResolvedValue(undefined) }));

const mockedPush = runOutboxSync as unknown as ReturnType<typeof vi.fn>;
const mockedPull = runSyncPull as unknown as ReturnType<typeof vi.fn>;
const mockedSetSyncAt = setLastSyncAt as unknown as ReturnType<typeof vi.fn>;

describe('runMobileSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executa push antes do pull', async () => {
    const order: string[] = [];
    mockedPush.mockImplementation(async () => {
      order.push('push');
      return { sent: 1, failed: 0, blocked: 0, conflicts: 0, skipped: 0 };
    });
    mockedPull.mockImplementation(async () => {
      order.push('pull');
      return {
        pages: 1,
        changes: 0,
        hasMoreStopped: false,
        serverTime: '2026-01-01T00:00:00Z',
        applied: { upsertedInspections: 0, upsertedResponses: 0, deletedInspections: 0 },
      };
    });

    await runMobileSync();

    expect(order).toEqual(['push', 'pull']);
    expect(mockedSetSyncAt).toHaveBeenCalled();
  });
});
