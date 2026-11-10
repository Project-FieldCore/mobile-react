import { describe, expect, it } from 'vitest';

import type { PendingOperation } from './draftStore';
import {
  buildHomeChip,
  composeSyncFailureBanner,
  composeSyncSuccessBanner,
  countByStatus,
  humanizeSyncError,
  listSyncIndicatorForInspection,
  operationStatusLabel,
  operationTypeLabel,
  truncateMessage,
} from './syncStatusUi';
import { ApiError } from '@/infrastructure/api/client';

const op = (
  overrides: Partial<PendingOperation> & Pick<PendingOperation, 'id' | 'inspectionId' | 'status'>,
): PendingOperation => ({
  createdAt: '2026-01-01T10:00:00Z',
  attempts: 0,
  ...overrides,
});

describe('syncStatusUi', () => {
  it('rotula tipo e status em PT-BR', () => {
    expect(operationTypeLabel('ANSWERS')).toBe('Respostas');
    expect(operationTypeLabel('COMPLETE')).toBe('Conclusão');
    expect(operationTypeLabel(undefined)).toBe('Alteração');
    expect(operationStatusLabel('FAILED')).toBe('Falha');
    expect(operationStatusLabel('CONFLICT')).toBe('Conflito');
  });

  it('trunca mensagens longas em 120 chars', () => {
    expect(truncateMessage('curta')).toBe('curta');
    expect(truncateMessage('x'.repeat(130)).endsWith('…')).toBe(true);
    expect(truncateMessage('x'.repeat(130)).length).toBe(120);
  });

  it('humaniza erros técnicos e de rede/auth/conflito', () => {
    expect(humanizeSyncError('Network request failed')).toContain('Sem conexão');
    expect(humanizeSyncError('UNAUTHORIZED 401')).toContain('Sessão expirada');
    expect(humanizeSyncError('CONFLICT version')).toContain('conflita');
    expect(humanizeSyncError('{"stack":"boom"}')).toBe('Não foi possível enviar esta alteração.');
    expect(humanizeSyncError('A versão local diverge da versão no servidor.')).toContain('versão');
  });

  it('monta chip Home com precedência falha > conflito > pendente', () => {
    expect(buildHomeChip({ pending: 0, syncing: 0, failed: 0, conflict: 0, total: 0 })).toBeNull();
    expect(buildHomeChip({ pending: 2, syncing: 0, failed: 1, conflict: 3, total: 6 })).toEqual(
      expect.objectContaining({ tone: 'danger', actionLabel: 'Ver detalhes', subtitle: '2 pendente(s)' }),
    );
    expect(buildHomeChip({ pending: 0, syncing: 0, failed: 0, conflict: 2, total: 2 })?.tone).toBe('warning');
    expect(buildHomeChip({ pending: 3, syncing: 0, failed: 0, conflict: 0, total: 3 })).toEqual(
      expect.objectContaining({ tone: 'navy', actionLabel: 'Sincronizar' }),
    );
  });

  it('escolhe indicador da lista por precedência na inspeção', () => {
    const operations = [
      op({ id: '1', inspectionId: 'A', status: 'PENDING' }),
      op({ id: '2', inspectionId: 'A', status: 'CONFLICT' }),
      op({ id: '3', inspectionId: 'B', status: 'FAILED' }),
    ];
    expect(listSyncIndicatorForInspection('A', operations)?.caption).toBe('Conflito na sincronização');
    expect(listSyncIndicatorForInspection('B', operations)?.caption).toBe('Falha na sincronização');
    expect(listSyncIndicatorForInspection('C', operations, 'PENDING_SYNC')?.caption).toBe('Aguardando sincronização');
    expect(listSyncIndicatorForInspection('D', operations)).toBeNull();
  });

  it('compõe banner de sucesso limpo vs parcial', () => {
    const basePull = {
      pages: 1,
      changes: 0,
      hasMoreStopped: false,
      serverTime: '2026-01-01T12:00:00Z',
      applied: { upsertedInspections: 0, upsertedResponses: 0, deletedInspections: 0 },
    };
    const clean = composeSyncSuccessBanner({
      push: { sent: 1, failed: 0, blocked: 0, conflicts: 0, skipped: 0 },
      pull: basePull,
    });
    expect(clean.kind).toBe('success');
    expect(clean.message.startsWith('Sincronização concluída.')).toBe(true);

    const partial = composeSyncSuccessBanner({
      push: { sent: 0, failed: 1, blocked: 0, conflicts: 1, skipped: 0 },
      pull: basePull,
    });
    expect(partial.kind).toBe('partial');
    expect(partial.message).toContain('pendências');
  });

  it('compõe banner de falha auth/rede', () => {
    expect(composeSyncFailureBanner(new ApiError('x', 401, 'UNAUTHORIZED')).kind).toBe('auth');
    expect(composeSyncFailureBanner(new ApiError('Não foi possível conectar ao servidor.', undefined)).message)
      .toContain('conexão');
  });

  it('conta status da outbox', () => {
    expect(countByStatus([
      op({ id: '1', inspectionId: 'A', status: 'PENDING' }),
      op({ id: '2', inspectionId: 'A', status: 'FAILED' }),
      op({ id: '3', inspectionId: 'B', status: 'CONFLICT' }),
    ])).toEqual({ pending: 1, syncing: 0, failed: 1, conflict: 1, total: 3 });
  });
});
