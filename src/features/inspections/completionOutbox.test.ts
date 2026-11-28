import { describe, expect, it } from 'vitest';

import { isNetworkUnavailableError, NETWORK_TIMEOUT_CODE, NETWORK_UNAVAILABLE_CODE } from '@/infrastructure/api/errorResponse';
import { ApiError } from '@/infrastructure/api/client';
import { applyPendingCompletionStatus, parseCompletionPayload } from './completionOutbox';
import type { PendingOperation } from './draftStore';
import type { Inspection } from './mockRepository';

const inspection = (id: string, status: Inspection['status']): Inspection => ({
  id, client: 'C', site: 'S', equipment: 'E', scheduledAt: 'hoje', priority: 'LOW', status, instructions: '',
});

const completeOp = (inspectionId: string, payload?: unknown): PendingOperation => ({
  id: `op-${inspectionId}`, inspectionId, createdAt: 'x', status: 'PENDING', attempts: 0, operationType: 'COMPLETE',
  payload: payload === undefined
    ? JSON.stringify({ kind: 'INSPECTION_COMPLETION', v: 1, operationId: `op-${inspectionId}`, inspectionId, baseVersion: 1, completedAtDevice: 'x', answers: [] })
    : JSON.stringify(payload),
});

describe('conclusão pendente na lista', () => {
  it('mantém "Aguardando sincronização" enquanto houver COMPLETE na outbox', () => {
    const list = [inspection('a', 'IN_PROGRESS'), inspection('b', 'IN_PROGRESS'), inspection('c', 'SUBMITTED')];
    const result = applyPendingCompletionStatus(list, [completeOp('a'), completeOp('c')]);
    expect(result.map((item) => item.status)).toEqual(['PENDING_SYNC', 'IN_PROGRESS', 'SUBMITTED']);
  });

  it('ignora COMPLETE legado (mock) sem payload de conclusão', () => {
    const result = applyPendingCompletionStatus([inspection('a', 'IN_PROGRESS')], [completeOp('a', { inspectionId: 'a' })]);
    expect(result[0]?.status).toBe('IN_PROGRESS');
    expect(parseCompletionPayload('{"inspectionId":"a"}')).toBeNull();
  });
});

describe('isNetworkUnavailableError', () => {
  it('só é verdadeiro para falha de rede/timeout, nunca para respostas HTTP', () => {
    expect(isNetworkUnavailableError(new ApiError('x', undefined, NETWORK_UNAVAILABLE_CODE))).toBe(true);
    expect(isNetworkUnavailableError(new ApiError('x', undefined, NETWORK_TIMEOUT_CODE))).toBe(true);
    expect(isNetworkUnavailableError(new ApiError('x', 500, 'INTERNAL'))).toBe(false);
    expect(isNetworkUnavailableError(new ApiError('A URL da API não foi configurada.'))).toBe(false);
    expect(isNetworkUnavailableError(new Error('boom'))).toBe(false);
    expect(isNetworkUnavailableError('x')).toBe(false);
  });
});
