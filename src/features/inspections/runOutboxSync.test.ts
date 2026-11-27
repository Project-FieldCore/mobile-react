import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '@/infrastructure/api/client';
import { getSession } from '@/infrastructure/storage/session';
import { getOrCreateDeviceId } from '@/infrastructure/storage/deviceId';
import { sendOutboxOperation } from './runOutboxSync';
import type { PendingOperation } from './draftStore';

vi.mock('@/infrastructure/api/client', () => ({ apiRequest: vi.fn() }));
vi.mock('@/infrastructure/storage/session', () => ({ getSession: vi.fn() }));
vi.mock('@/infrastructure/storage/deviceId', () => ({ getOrCreateDeviceId: vi.fn() }));
vi.mock('./draftStore', () => ({
  getPendingOperations: vi.fn().mockResolvedValue([]),
  replaceSyncOperationPayload: vi.fn().mockResolvedValue(undefined),
  rekeySyncOperation: vi.fn(),
  removeSyncOperation: vi.fn(),
  updateSyncOperation: vi.fn(),
}));

const mockedApiRequest = apiRequest as unknown as ReturnType<typeof vi.fn>;
const mockedGetSession = getSession as unknown as ReturnType<typeof vi.fn>;
const mockedDeviceId = getOrCreateDeviceId as unknown as ReturnType<typeof vi.fn>;

const answerOperation = (): PendingOperation => ({
  id: '11111111-1111-4111-8111-111111111111',
  inspectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  createdAt: '2026-01-01T10:00:00Z',
  status: 'PENDING',
  attempts: 0,
  operationType: 'ANSWERS',
  payload: JSON.stringify({
    entityId: '22222222-2222-4222-8222-222222222222',
    inspectionItemId: '33333333-3333-4333-8333-333333333333',
    baseVersion: 0,
    valueText: 'alpha',
  }),
});

describe('runOutboxSync / sendOutboxOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSession.mockResolvedValue({ accessToken: 'token', refreshToken: 'refresh', expiresAt: Date.now() + 60_000 });
    mockedDeviceId.mockResolvedValue('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  });

  it('pula LOCATION/EVIDENCE/COMPLETE sem chamar a API', async () => {
    await expect(sendOutboxOperation({
      ...answerOperation(),
      operationType: 'LOCATION',
    })).resolves.toEqual({ kind: 'skipped' });
    expect(mockedApiRequest).not.toHaveBeenCalled();
  });

  it('envia ANSWERS para POST /mobile/sync/push e confirma APPLIED', async () => {
    mockedApiRequest.mockResolvedValueOnce({
      serverTime: '2026-01-01T10:00:01Z',
      results: [{
        operationId: '11111111-1111-4111-8111-111111111111',
        status: 'APPLIED',
        entityVersion: 1,
      }],
    });

    await expect(sendOutboxOperation(answerOperation())).resolves.toEqual({ kind: 'applied' });

    expect(mockedApiRequest).toHaveBeenCalledWith('/mobile/sync/push', expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({
        deviceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        operations: [expect.objectContaining({
          operationId: '11111111-1111-4111-8111-111111111111',
          entityType: 'INSPECTION_RESPONSE',
          operationType: 'UPSERT',
          baseVersion: 0,
          payload: expect.objectContaining({
            inspectionItemId: '33333333-3333-4333-8333-333333333333',
            valueText: 'alpha',
          }),
        })],
      }),
    }));
  });

  it('preserva CONFLICT local a partir do recibo HTTP 200', async () => {
    mockedApiRequest.mockResolvedValueOnce({
      serverTime: '2026-01-01T10:00:01Z',
      results: [{
        operationId: '11111111-1111-4111-8111-111111111111',
        status: 'CONFLICT',
        entityVersion: 4,
        server: { valueText: 'server' },
      }],
    });

    const outcome = await sendOutboxOperation(answerOperation());
    expect(outcome.kind).toBe('conflict');
    if (outcome.kind === 'conflict') {
      expect(outcome.message).toContain('4');
    }
  });
});
