import { describe, expect, it, vi } from 'vitest';

import {
  isGenericInspection,
  mergeServerWithLocal,
  needsServerDetail,
  refreshInspectionsFromServer,
} from './inspectionRefresh';
import {
  approvalComment,
  canExecuteInspection,
  inspectionHeadline,
  inspectionStatusLabel,
} from './inspectionReviewUi';
import type { PendingOperation } from './draftStore';
import type { Inspection } from './mockRepository';

vi.mock('@/design-system/tokens', () => ({ colors: { danger: 'r', success: 'g', textMuted: 'm', navy: 'n' } }));

const inspection = (id: string, status: Inspection['status'], overrides: Partial<Inspection> = {}): Inspection => ({
  id, client: 'ACME', site: 'Planta', equipment: 'TR-01', scheduledAt: 'x', priority: 'HIGH', status,
  instructions: '', version: 1, ...overrides,
});
const op = (inspectionId: string): PendingOperation => ({
  id: `op-${inspectionId}`, inspectionId, createdAt: 't', status: 'PENDING', attempts: 0, operationType: 'ANSWERS',
});

describe('lista de inspeções (modo API)', () => {
  it('mantém ENVIADA/APROVADA/REPROVADA locais que /inspections/my não lista e deixa o servidor vencer por id', () => {
    const server = [inspection('a', 'ASSIGNED'), inspection('r', 'REJECTED', { version: 9 })];
    const local = [
      inspection('a', 'IN_PROGRESS'),
      inspection('r', 'SUBMITTED'),
      inspection('s', 'SUBMITTED'),
      inspection('ap', 'APPROVED'),
      inspection('stale', 'ASSIGNED'),
      inspection('canceled', 'CANCELED'),
      inspection('pend', 'IN_PROGRESS'),
    ];
    const merged = mergeServerWithLocal(server, local, [op('pend')]);
    expect(merged.map((item) => [item.id, item.status])).toEqual([
      ['a', 'ASSIGNED'], ['r', 'REJECTED'], ['s', 'SUBMITTED'], ['ap', 'APPROVED'], ['pend', 'IN_PROGRESS'],
    ]);
  });

  it('precisa do detalhe: enviada, decidida sem review ou dados genéricos do pull', () => {
    expect(needsServerDetail(inspection('s', 'SUBMITTED'))).toBe(true);
    expect(needsServerDetail(inspection('x', 'APPROVED'))).toBe(true);
    expect(needsServerDetail(inspection('x', 'APPROVED', { review: { decision: 'APPROVED', motivo: null, reviewerId: 'u', reviewedAt: 't' } }))).toBe(false);
    expect(needsServerDetail(inspection('g', 'ASSIGNED', { client: 'Cliente', site: 'Site' }))).toBe(true);
    expect(isGenericInspection(inspection('g', 'ASSIGNED'))).toBe(false);
    expect(needsServerDetail(inspection('a', 'ASSIGNED'))).toBe(false);
  });

  it('atualiza pelo detalhe do servidor (cliente/local reais + review) e preserva o local se a consulta falhar ou houver pendência', async () => {
    const approved = inspection('ap', 'APPROVED', {
      client: 'ACME Real', review: { decision: 'APPROVED', motivo: 'ok', reviewerId: 'u', reviewerName: 'Admin', reviewedAt: 't' },
    });
    const fetchInspection = vi.fn(async (id: string) => {
      if (id === 'fail') throw new Error('offline');
      return approved;
    });
    const saveInspection = vi.fn().mockResolvedValue(undefined);
    const generic = inspection('ap', 'APPROVED', { client: 'Cliente', site: 'Site' });
    const failing = inspection('fail', 'SUBMITTED');
    const pending = inspection('pend', 'SUBMITTED');

    const result = await refreshInspectionsFromServer([generic, failing, pending], { fetchInspection, saveInspection }, new Set(['pend']));

    expect(result).toEqual([approved, failing, pending]);
    expect(saveInspection).toHaveBeenCalledTimes(1);
    expect(saveInspection).toHaveBeenCalledWith(approved);
    expect(fetchInspection).not.toHaveBeenCalledWith('pend');
  });
});

describe('detalhe após a revisão', () => {
  it('rótulos por estado, execução só para ATRIBUÍDA/EM ANDAMENTO e comentário do revisor', () => {
    expect(inspectionStatusLabel('APPROVED')).toBe('Aprovada');
    expect(inspectionHeadline('APPROVED')).toBe('INSPEÇÃO APROVADA');
    expect(inspectionHeadline('SUBMITTED')).toBe('INSPEÇÃO ENVIADA');
    expect(canExecuteInspection('ASSIGNED')).toBe(true);
    expect(canExecuteInspection('APPROVED')).toBe(false);
    expect(canExecuteInspection('SUBMITTED')).toBe(false);
    expect(approvalComment({ decision: 'APPROVED', motivo: '  Aprovado.  ', reviewerId: 'u', reviewedAt: 't' })).toBe('Aprovado.');
    expect(approvalComment({ decision: 'APPROVED', motivo: null, reviewerId: 'u', reviewedAt: 't' })).toBeNull();
  });
});
