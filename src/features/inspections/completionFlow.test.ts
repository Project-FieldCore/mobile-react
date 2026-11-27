import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/infrastructure/api/client';
import { NETWORK_TIMEOUT_CODE, NETWORK_UNAVAILABLE_CODE } from '@/infrastructure/api/errorResponse';
import { processPendingOperations, type BatchSyncStorage } from './batchSync';
import {
  completeInspectionOfflineFirst,
  sendCompletionOperation,
  type CompleteFlowDeps,
  type SendCompletionDeps,
} from './completionFlow';
import { parseCompletionPayload, type CompletionPayload } from './completionOutbox';
import { sendEvidenceOperation, type SendEvidenceDeps } from './evidenceSync';
import type { PendingOperation } from './draftStore';
import type { ChecklistSection, Inspection } from './mockRepository';

const INSPECTION_ID = '11111111-1111-4111-8111-111111111111';
const SIGNATURE = { contentType: 'image/png' as const, dataBase64: 'iVBORw0KGgo=' };

const checklist: ChecklistSection[] = [
  {
    id: '1',
    title: 'Geral',
    items: [
      { id: 'item-a', label: 'Condição visual', type: 'conformity', required: true, observationRequired: true },
      { id: 'item-b', label: 'Temperatura', type: 'number', required: true },
    ],
  },
];

function inspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: INSPECTION_ID, client: 'C', site: 'S', equipment: 'E', scheduledAt: 'hoje', priority: 'HIGH',
    status: 'IN_PROGRESS', instructions: '', version: 4, ...overrides,
  };
}

const networkError = () => new ApiError('Não foi possível conectar ao servidor.', undefined, NETWORK_UNAVAILABLE_CODE);
const timeoutError = () => new ApiError('A conexão com o servidor excedeu 15 segundos.', undefined, NETWORK_TIMEOUT_CODE);
const httpError = (status: number, code: string, message = 'erro de negócio') => new ApiError(message, status, code, '/x');

function makeDeps(overrides: Partial<CompleteFlowDeps> = {}): CompleteFlowDeps {
  return {
    getCachedInspection: vi.fn().mockResolvedValue(inspection()),
    getCachedChecklist: vi.fn().mockResolvedValue(checklist),
    fetchChecklist: vi.fn().mockRejectedValue(networkError()),
    fetchInspection: vi.fn().mockRejectedValue(networkError()),
    getDraft: vi.fn().mockResolvedValue({ answers: { 'item-a': 'Conforme', 'item-b': '42' } }),
    captureLocation: vi.fn().mockResolvedValue({ latitude: -23.5, longitude: -46.6, capturedAt: '2026-11-26T00:00:00Z' }),
    saveLocation: vi.fn().mockResolvedValue(undefined),
    completeRemote: vi.fn().mockRejectedValue(networkError()),
    enqueueCompletion: vi.fn().mockResolvedValue('op-1'),
    markPendingSync: vi.fn().mockResolvedValue(undefined),
    markSubmitted: vi.fn().mockResolvedValue(undefined),
    removeDeliveredOperations: vi.fn().mockResolvedValue(undefined),
    now: () => '2026-11-26T23:00:00.000Z',
    ...overrides,
  };
}

describe('conclusão offline-first no modo API', () => {
  let deps: CompleteFlowDeps;
  beforeEach(() => { deps = makeDeps(); });

  it('sem rede: enfileira COMPLETE com tudo localmente e marca PENDING_SYNC', async () => {
    const result = await completeInspectionOfflineFirst(INSPECTION_ID, SIGNATURE, deps);

    expect(result).toEqual({ coordinatesSent: true, queued: true });
    expect(deps.enqueueCompletion).toHaveBeenCalledTimes(1);
    expect(deps.enqueueCompletion).toHaveBeenCalledWith(INSPECTION_ID, expect.objectContaining({
      kind: 'INSPECTION_COMPLETION',
      inspectionId: INSPECTION_ID,
      baseVersion: 4,
      completedAtDevice: '2026-11-26T23:00:00.000Z',
      latitude: -23.5,
      longitude: -46.6,
      signature: SIGNATURE,
      answers: [
        expect.objectContaining({ itemId: 'item-a', valueText: 'Conforme', conformity: 'CONFORMING' }),
        expect.objectContaining({ itemId: 'item-b', valueText: '42' }),
      ],
    }));
    expect(deps.markPendingSync).toHaveBeenCalledWith(INSPECTION_ID);
    expect(deps.markSubmitted).not.toHaveBeenCalled();
  });

  it('timeout também é tratado como offline', async () => {
    deps = makeDeps({ completeRemote: vi.fn().mockRejectedValue(timeoutError()) });
    await expect(completeInspectionOfflineFirst(INSPECTION_ID, SIGNATURE, deps)).resolves.toMatchObject({ queued: true });
    expect(deps.enqueueCompletion).toHaveBeenCalled();
  });

  it('não faz chamadas de rede antes de tentar concluir (usa checklist/versão locais)', async () => {
    await completeInspectionOfflineFirst(INSPECTION_ID, undefined, deps);
    expect(deps.fetchChecklist).not.toHaveBeenCalled();
    expect(deps.fetchInspection).not.toHaveBeenCalled();
    expect(deps.completeRemote).toHaveBeenCalledTimes(1);
    expect(deps.completeRemote).toHaveBeenCalledWith(INSPECTION_ID, 4, expect.any(Array), expect.anything(), undefined, '2026-11-26T23:00:00.000Z');
  });

  it('sem GPS, a conclusão offline segue sem coordenadas', async () => {
    deps = makeDeps({ captureLocation: vi.fn().mockResolvedValue(undefined) });
    const result = await completeInspectionOfflineFirst(INSPECTION_ID, SIGNATURE, deps);
    expect(result).toEqual({ coordinatesSent: false, queued: true });
    expect(deps.saveLocation).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'SIGNATURE_INVALID'],
    [409, 'INSPECTION_INCOMPLETE'],
    [422, 'VALIDATION_ERROR'],
    [500, 'INTERNAL_ERROR'],
  ])('erro de negócio %s/%s NÃO enfileira e é exibido', async (status, code) => {
    deps = makeDeps({ completeRemote: vi.fn().mockRejectedValue(httpError(status, code, 'mensagem do servidor')) });
    await expect(completeInspectionOfflineFirst(INSPECTION_ID, SIGNATURE, deps)).rejects.toThrow('mensagem do servidor');
    expect(deps.enqueueCompletion).not.toHaveBeenCalled();
    expect(deps.markPendingSync).not.toHaveBeenCalled();
  });

  it('online: conclui, limpa operações entregues e marca SUBMITTED sem enfileirar', async () => {
    deps = makeDeps({ completeRemote: vi.fn().mockResolvedValue(undefined) });
    await expect(completeInspectionOfflineFirst(INSPECTION_ID, SIGNATURE, deps)).resolves.toEqual({ coordinatesSent: true, queued: false });
    expect(deps.enqueueCompletion).not.toHaveBeenCalled();
    expect(deps.removeDeliveredOperations).toHaveBeenCalledWith(INSPECTION_ID);
    expect(deps.markSubmitted).toHaveBeenCalledWith(INSPECTION_ID);
  });

  it('versão local desatualizada com rede: renova uma vez e conclui', async () => {
    const completeRemote = vi.fn()
      .mockRejectedValueOnce(httpError(409, 'VERSION_CONFLICT'))
      .mockResolvedValueOnce(undefined);
    deps = makeDeps({ completeRemote, fetchInspection: vi.fn().mockResolvedValue(inspection({ version: 7 })) });

    await expect(completeInspectionOfflineFirst(INSPECTION_ID, SIGNATURE, deps)).resolves.toMatchObject({ queued: false });
    expect(completeRemote.mock.calls.map((call) => call[1])).toEqual([4, 7]);
  });

  it('VERSION_CONFLICT seguido de queda de rede enfileira', async () => {
    deps = makeDeps({
      completeRemote: vi.fn().mockRejectedValue(httpError(409, 'VERSION_CONFLICT')),
      fetchInspection: vi.fn().mockRejectedValue(networkError()),
    });
    await expect(completeInspectionOfflineFirst(INSPECTION_ID, SIGNATURE, deps)).resolves.toMatchObject({ queued: true });
  });

  it('exige observação em item não conforme ANTES de qualquer envio/fila', async () => {
    deps = makeDeps({ getDraft: vi.fn().mockResolvedValue({ answers: { 'item-a': 'Não conforme' } }) });
    await expect(completeInspectionOfflineFirst(INSPECTION_ID, SIGNATURE, deps)).rejects.toThrow('Condição visual exige uma observação.');
    expect(deps.completeRemote).not.toHaveBeenCalled();
    expect(deps.enqueueCompletion).not.toHaveBeenCalled();
  });

  it('sem checklist local usa a rede; se falhar, o erro é mostrado (nada a enfileirar)', async () => {
    deps = makeDeps({ getCachedChecklist: vi.fn().mockResolvedValue(null) });
    await expect(completeInspectionOfflineFirst(INSPECTION_ID, SIGNATURE, deps)).rejects.toBeInstanceOf(ApiError);
    expect(deps.enqueueCompletion).not.toHaveBeenCalled();
  });
});

function completionOperation(overrides: Partial<CompletionPayload> = {}, id = 'op-1'): PendingOperation {
  const payload: CompletionPayload = {
    kind: 'INSPECTION_COMPLETION', v: 1, operationId: id, inspectionId: INSPECTION_ID, baseVersion: 4,
    completedAtDevice: '2026-11-26T23:00:00.000Z',
    answers: [{ itemId: 'item-a', valueText: 'Conforme', conformity: 'CONFORMING' }],
    latitude: -23.5, longitude: -46.6, signature: SIGNATURE, ...overrides,
  };
  return {
    id, inspectionId: INSPECTION_ID, createdAt: '2026-11-26T23:00:00.000Z', status: 'PENDING', attempts: 0,
    operationType: 'COMPLETE', payload: JSON.stringify(payload),
  };
}

function makeSendDeps(overrides: Partial<SendCompletionDeps> = {}): SendCompletionDeps {
  return {
    fetchInspection: vi.fn().mockResolvedValue(inspection({ version: 6 })),
    completeRemote: vi.fn().mockResolvedValue(undefined),
    markSubmitted: vi.fn().mockResolvedValue(undefined),
    removeDeliveredOperations: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('sync da conclusão (COMPLETE)', () => {
  it('envia com a versão atual do servidor e o instante/GPS/assinatura salvos', async () => {
    const deps = makeSendDeps();
    await expect(sendCompletionOperation(completionOperation(), deps)).resolves.toEqual({ kind: 'applied' });

    expect(deps.completeRemote).toHaveBeenCalledWith(
      INSPECTION_ID, 6,
      [{ itemId: 'item-a', valueText: 'Conforme', conformity: 'CONFORMING' }],
      { latitude: -23.5, longitude: -46.6 }, SIGNATURE, '2026-11-26T23:00:00.000Z',
    );
    expect(deps.markSubmitted).toHaveBeenCalledWith(INSPECTION_ID);
    expect(deps.removeDeliveredOperations).toHaveBeenCalledWith(INSPECTION_ID);
  });

  it('reenvio idempotente: servidor já SUBMITTED/APPROVED/REJECTED = aplicado, sem novo POST', async () => {
    for (const status of ['SUBMITTED', 'APPROVED', 'REJECTED'] as const) {
      const deps = makeSendDeps({ fetchInspection: vi.fn().mockResolvedValue(inspection({ status })) });
      await expect(sendCompletionOperation(completionOperation(), deps)).resolves.toEqual({ kind: 'applied' });
      expect(deps.completeRemote).not.toHaveBeenCalled();
      expect(deps.markSubmitted).toHaveBeenCalled();
    }
  });

  it('resposta perdida: 409 INSPECTION_NOT_IN_PROGRESS + servidor SUBMITTED = aplicado (sem duplicar)', async () => {
    const fetchInspection = vi.fn()
      .mockResolvedValueOnce(inspection({ version: 6 }))
      .mockResolvedValueOnce(inspection({ status: 'SUBMITTED' }));
    const deps = makeSendDeps({
      fetchInspection,
      completeRemote: vi.fn().mockRejectedValue(httpError(409, 'INSPECTION_NOT_IN_PROGRESS')),
    });
    await expect(sendCompletionOperation(completionOperation(), deps)).resolves.toEqual({ kind: 'applied' });
  });

  it('o mesmo operationId/payload é reutilizado em cada reenvio', async () => {
    const operation = completionOperation({}, 'op-estavel');
    const deps = makeSendDeps({ completeRemote: vi.fn().mockRejectedValueOnce(networkError()).mockResolvedValue(undefined) });

    await expect(sendCompletionOperation(operation, deps)).rejects.toBeInstanceOf(ApiError);
    await expect(sendCompletionOperation(operation, deps)).resolves.toEqual({ kind: 'applied' });

    const [first, second] = (deps.completeRemote as ReturnType<typeof vi.fn>).mock.calls;
    expect(second).toEqual(first);
    expect(parseCompletionPayload(operation.payload)?.operationId).toBe('op-estavel');
  });

  it('erro de negócio no envio vira falha com mensagem; rede propaga para nova tentativa', async () => {
    const business = makeSendDeps({ completeRemote: vi.fn().mockRejectedValue(httpError(409, 'INSPECTION_INCOMPLETE', 'Item obrigatório pendente')) });
    await expect(sendCompletionOperation(completionOperation(), business)).resolves.toEqual({ kind: 'failed', message: 'Item obrigatório pendente' });
    expect(business.markSubmitted).not.toHaveBeenCalled();

    const offline = makeSendDeps({ fetchInspection: vi.fn().mockRejectedValue(networkError()) });
    await expect(sendCompletionOperation(completionOperation(), offline)).rejects.toBeInstanceOf(ApiError);
  });

  it('VERSION_CONFLICT renova a versão uma vez; inspeção cancelada/não iniciada falha sem enviar', async () => {
    const completeRemote = vi.fn().mockRejectedValueOnce(httpError(409, 'VERSION_CONFLICT')).mockResolvedValueOnce(undefined);
    const fetchInspection = vi.fn().mockResolvedValueOnce(inspection({ version: 6 })).mockResolvedValueOnce(inspection({ version: 8 }));
    await expect(sendCompletionOperation(completionOperation(), makeSendDeps({ completeRemote, fetchInspection }))).resolves.toEqual({ kind: 'applied' });
    expect(completeRemote.mock.calls.map((call) => call[1])).toEqual([6, 8]);

    for (const status of ['CANCELED', 'ASSIGNED'] as const) {
      const deps = makeSendDeps({ fetchInspection: vi.fn().mockResolvedValue(inspection({ status })) });
      await expect(sendCompletionOperation(completionOperation(), deps)).resolves.toMatchObject({ kind: 'failed' });
      expect(deps.completeRemote).not.toHaveBeenCalled();
    }
  });

  it('payload inválido falha sem chamar a rede', async () => {
    const deps = makeSendDeps();
    const broken = { ...completionOperation(), payload: '{"inspectionId":1}' };
    await expect(sendCompletionOperation(broken, deps)).resolves.toMatchObject({ kind: 'failed' });
    expect(deps.fetchInspection).not.toHaveBeenCalled();
  });
});

describe('sync de evidências', () => {
  const evidenceOperation = (id: string, itemId: string | undefined, uri = 'file:///doc/foto.jpg'): PendingOperation => ({
    id, inspectionId: INSPECTION_ID, createdAt: '2026-11-26T22:00:00.000Z', status: 'PENDING', attempts: 0,
    operationType: 'EVIDENCE', payload: JSON.stringify({ uri, capturedAt: '2026-11-26T22:00:00Z', itemId, uploadStatus: 'PENDING' }),
  });

  it('sobe a foto pendente e marca como enviada', async () => {
    const deps: SendEvidenceDeps = {
      getDraft: vi.fn().mockResolvedValue({ answers: {}, evidence: [{ uri: 'file:///doc/foto.jpg', capturedAt: 'x', itemId: 'item-a', uploadStatus: 'PENDING' }] }),
      upload: vi.fn().mockResolvedValue(undefined),
      setUploadStatus: vi.fn().mockResolvedValue(undefined),
    };
    await expect(sendEvidenceOperation(evidenceOperation('e1', 'item-a'), deps)).resolves.toEqual({ kind: 'applied' });
    expect(deps.upload).toHaveBeenCalledWith(INSPECTION_ID, 'item-a', 'file:///doc/foto.jpg');
    expect(deps.setUploadStatus).toHaveBeenCalledWith(INSPECTION_ID, 'file:///doc/foto.jpg', 'UPLOADED');
  });

  it('foto já enviada não é reenviada; rascunho limpo não é recriado; sem item permanece na fila', async () => {
    const uploaded: SendEvidenceDeps = {
      getDraft: vi.fn().mockResolvedValue({ answers: {}, evidence: [{ uri: 'file:///doc/foto.jpg', capturedAt: 'x', itemId: 'item-a', uploadStatus: 'UPLOADED' }] }),
      upload: vi.fn(), setUploadStatus: vi.fn(),
    };
    await expect(sendEvidenceOperation(evidenceOperation('e1', 'item-a'), uploaded)).resolves.toEqual({ kind: 'applied' });
    expect(uploaded.upload).not.toHaveBeenCalled();

    const cleared: SendEvidenceDeps = { getDraft: vi.fn().mockResolvedValue(undefined), upload: vi.fn().mockResolvedValue(undefined), setUploadStatus: vi.fn() };
    await expect(sendEvidenceOperation(evidenceOperation('e2', 'item-a'), cleared)).resolves.toEqual({ kind: 'applied' });
    expect(cleared.upload).toHaveBeenCalledTimes(1);
    expect(cleared.setUploadStatus).not.toHaveBeenCalled();

    const noItem: SendEvidenceDeps = { getDraft: vi.fn(), upload: vi.fn(), setUploadStatus: vi.fn() };
    await expect(sendEvidenceOperation(evidenceOperation('e3', undefined), noItem)).resolves.toEqual({ kind: 'skipped' });
    expect(noItem.upload).not.toHaveBeenCalled();
  });
});

describe('ordem do push: respostas → evidências → conclusão', () => {
  function storageFor(operations: PendingOperation[]): BatchSyncStorage {
    return {
      getPendingOperations: vi.fn().mockResolvedValue(operations),
      updateSyncOperation: vi.fn().mockResolvedValue(undefined),
      removeSyncOperation: vi.fn().mockResolvedValue(undefined),
      recordConflictOperation: vi.fn().mockResolvedValue(undefined),
    };
  }
  const base = { inspectionId: INSPECTION_ID, status: 'PENDING' as const, attempts: 0 };
  // Criadas na ordem inversa de propósito: COMPLETE é a mais antiga.
  const operations = (): PendingOperation[] => [
    { ...completionOperation({}, 'complete'), createdAt: '2026-11-26T20:00:00.000Z' },
    { ...base, id: 'evidence', createdAt: '2026-11-26T21:00:00.000Z', operationType: 'EVIDENCE', payload: JSON.stringify({ uri: 'file:///f.jpg', capturedAt: 'x', itemId: 'item-a' }) },
    { ...base, id: 'answers', createdAt: '2026-11-26T22:00:00.000Z', operationType: 'ANSWERS', payload: '{}' },
  ];

  it('envia ANSWERS, depois EVIDENCE, depois COMPLETE e remove da outbox', async () => {
    const order: string[] = [];
    const storage = storageFor(operations());
    const result = await processPendingOperations(storage, async (operation) => {
      order.push(operation.operationType ?? '?');
      return { kind: 'applied' };
    });
    expect(order).toEqual(['ANSWERS', 'EVIDENCE', 'COMPLETE']);
    expect(result.sent).toBe(3);
    expect(storage.removeSyncOperation).toHaveBeenCalledTimes(3);
  });

  it('sem rede a operação continua PENDING (reenvio automático no próximo sync) e bloqueia as seguintes', async () => {
    const storage = storageFor(operations());
    const result = await processPendingOperations(storage, async () => { throw networkError(); });
    expect(storage.updateSyncOperation).toHaveBeenCalledWith('answers', 'PENDING', expect.stringContaining('conectar'));
    expect(result).toMatchObject({ sent: 0, failed: 1, blocked: 2 });
  });

  it('falha numa evidência bloqueia a conclusão da mesma inspeção (fica pendente)', async () => {
    const storage = storageFor(operations());
    const sent: string[] = [];
    const result = await processPendingOperations(storage, async (operation) => {
      sent.push(operation.id);
      if (operation.operationType === 'EVIDENCE') throw networkError();
      return { kind: 'applied' };
    });
    expect(sent).toEqual(['answers', 'evidence']);
    expect(result).toMatchObject({ sent: 1, failed: 1, blocked: 1 });
    expect(storage.removeSyncOperation).not.toHaveBeenCalledWith('complete');
  });
});
