import { describe, expect, it } from 'vitest';

import { mapAnswerValue, mapSyncReceipt, receiptMessage, toMobileSyncOperation } from './syncPushMapper';
import type { PendingOperation } from './draftStore';

describe('syncPushMapper', () => {
  it('converte rótulos de conformidade e booleanos para o payload da API', () => {
    expect(mapAnswerValue('Não conforme')).toEqual({ conformity: 'NON_CONFORMING' });
    expect(mapAnswerValue('Sim')).toEqual({ valueBoolean: true });
    expect(mapAnswerValue('12.5')).toEqual({ valueNumber: 12.5 });
    expect(mapAnswerValue('ok')).toEqual({ valueText: 'ok' });
  });

  it('monta INSPECTION_RESPONSE UPSERT a partir da outbox ANSWERS', () => {
    const operation: PendingOperation = {
      id: '11111111-1111-4111-8111-111111111111',
      inspectionId: 'insp',
      createdAt: '2026-01-01T10:00:00Z',
      status: 'PENDING',
      attempts: 0,
      operationType: 'ANSWERS',
      payload: JSON.stringify({
        entityId: '22222222-2222-4222-8222-222222222222',
        inspectionItemId: '33333333-3333-4333-8333-333333333333',
        baseVersion: 2,
        valueText: 'alpha',
      }),
    };

    expect(toMobileSyncOperation(operation)).toEqual({
      operationId: '11111111-1111-4111-8111-111111111111',
      entityType: 'INSPECTION_RESPONSE',
      entityId: '22222222-2222-4222-8222-222222222222',
      operationType: 'UPSERT',
      baseVersion: 2,
      payload: {
        inspectionItemId: '33333333-3333-4333-8333-333333333333',
        valueText: 'alpha',
        valueNumber: undefined,
        valueBoolean: undefined,
        valueDate: undefined,
        conformity: undefined,
        observation: undefined,
      },
    });
  });

  it('mapeia recibos APPLIED/ALREADY_APPLIED/CONFLICT/REJECTED', () => {
    expect(mapSyncReceipt({ operationId: '1', status: 'APPLIED', entityVersion: 3 })).toEqual({ kind: 'applied' });
    expect(mapSyncReceipt({ operationId: '1', status: 'ALREADY_APPLIED', entityVersion: 3 })).toEqual({ kind: 'applied' });
    expect(mapSyncReceipt({
      operationId: '1',
      status: 'CONFLICT',
      entityVersion: 4,
      server: { valueText: 'server' },
    })).toEqual({
      kind: 'conflict',
      message: receiptMessage('CONFLICT', 4),
      entityVersion: 4,
      server: { valueText: 'server' },
    });
    expect(mapSyncReceipt({ operationId: '1', status: 'REJECTED' })).toEqual({
      kind: 'failed',
      message: receiptMessage('REJECTED'),
    });
    expect(mapSyncReceipt({ operationId: '1', status: 'DEPENDENCY_FAILED' })).toEqual({
      kind: 'failed',
      message: receiptMessage('DEPENDENCY_FAILED'),
    });
  });
});
