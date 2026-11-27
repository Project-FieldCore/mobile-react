/**
 * Início de inspeção offline-first (modo API), com dependências injetáveis:
 *  - `startInspectionOfflineFirst`: tenta iniciar online; sem rede, grava a
 *    operação START na outbox (a cópia local passa a EM ANDAMENTO).
 *  - `sendStartOperation`: aplica o START no sync, antes de respostas/evidências/
 *    conclusão. Idempotente: o servidor trata inspeção já EM ANDAMENTO como sucesso
 *    e reconhece o `X-Operation-Id` estável.
 *  - `ensureStartOperations`: cura filas criadas sem START (início offline antigo).
 */
import { ApiError } from '@/infrastructure/api/client';
import { isNetworkUnavailableError } from '@/infrastructure/api/errorResponse';
import type { SendOutcome } from './batchSync';
import type { PendingOperation } from './draftStore';
import type { Inspection } from './mockRepository';
import { parseStartPayload, START_PAYLOAD_VERSION, type StartPayload } from './startOutbox';
import { describeSyncError } from './syncErrorMessage';

type Location = { latitude: number; longitude: number };

export type StartRemote = (
  id: string,
  startedAtDevice: string,
  location: Location | undefined,
  operationId?: string,
) => Promise<Inspection>;

export type StartFlowDeps = {
  getCachedInspection: (id: string) => Promise<Inspection | null>;
  startRemote: StartRemote;
  enqueueStart: (inspectionId: string, payload: Omit<StartPayload, 'operationId'>) => Promise<string>;
  saveInspection: (inspection: Inspection) => Promise<void>;
};

export type StartResult = { queued: boolean };

export async function startInspectionOfflineFirst(
  id: string,
  startedAtDevice: string,
  location: Location | undefined,
  deps: StartFlowDeps,
): Promise<StartResult> {
  try {
    // Idempotente no servidor: inspeção já EM ANDAMENTO devolve o estado atual.
    const started = await deps.startRemote(id, startedAtDevice, location);
    await deps.saveInspection(started).catch(() => undefined);
    return { queued: false };
  } catch (error) {
    if (!isNetworkUnavailableError(error)) throw new Error(describeSyncError(error, 'Não foi possível iniciar a inspeção.'));
    const cached = await deps.getCachedInspection(id);
    if (!cached) throw new Error('Não foi possível abrir a inspeção sem uma cópia baixada.');
    await deps.enqueueStart(id, {
      kind: 'INSPECTION_START',
      v: START_PAYLOAD_VERSION,
      inspectionId: id,
      startedAtDevice,
      latitude: location?.latitude,
      longitude: location?.longitude,
    });
    await deps.saveInspection({ ...cached, status: cached.status === 'ASSIGNED' ? 'IN_PROGRESS' : cached.status });
    return { queued: true };
  }
}

export type SendStartDeps = {
  startRemote: StartRemote;
  /** Chamado com o estado devolvido pelo servidor (atualiza cópia local e versões das respostas). */
  onStarted: (inspection: Inspection) => Promise<void>;
};

export async function sendStartOperation(operation: PendingOperation, deps: SendStartDeps): Promise<SendOutcome> {
  const payload = parseStartPayload(operation.payload);
  if (!payload) return { kind: 'failed', message: 'A operação de início está incompleta.' };

  const location = payload.latitude != null && payload.longitude != null
    ? { latitude: payload.latitude, longitude: payload.longitude }
    : undefined;

  let started: Inspection;
  try {
    started = await deps.startRemote(payload.inspectionId, payload.startedAtDevice, location, operation.id);
  } catch (error) {
    if (isNetworkUnavailableError(error) || !(error instanceof ApiError)) throw error;
    return { kind: 'failed', message: describeSyncError(error, 'Não foi possível iniciar a inspeção no servidor.') };
  }
  await deps.onStarted(started);
  return { kind: 'applied' };
}

const DEPENDENT_TYPES = new Set(['ANSWERS', 'EVIDENCE', 'COMPLETE']);

export type EnsureStartDeps = {
  getPendingOperations: () => Promise<PendingOperation[]>;
  fetchInspection: (id: string) => Promise<Inspection | null>;
  enqueueStart: (inspectionId: string, payload: Omit<StartPayload, 'operationId'>) => Promise<string>;
};

/**
 * Inspeções com operações pendentes, mas sem START na outbox e ainda ASSIGNED no
 * servidor (início feito offline por versões anteriores do app): enfileira o START.
 * Sem rede, não faz nada (o sync seguinte tenta de novo).
 */
export async function ensureStartOperations(deps: EnsureStartDeps): Promise<number> {
  const operations = await deps.getPendingOperations();
  const byInspection = new Map<string, PendingOperation[]>();
  for (const operation of operations) {
    const list = byInspection.get(operation.inspectionId) ?? [];
    list.push(operation);
    byInspection.set(operation.inspectionId, list);
  }

  let created = 0;
  for (const [inspectionId, list] of byInspection) {
    if (list.some((operation) => operation.operationType === 'START')) continue;
    const dependents = list.filter((operation) => DEPENDENT_TYPES.has(operation.operationType ?? ''));
    if (dependents.length === 0) continue;
    try {
      const server = await deps.fetchInspection(inspectionId);
      if (server?.status !== 'ASSIGNED') continue;
    } catch (error) {
      if (isNetworkUnavailableError(error)) break;
      continue;
    }
    const startedAtDevice = dependents.map((operation) => operation.createdAt).sort()[0];
    await deps.enqueueStart(inspectionId, {
      kind: 'INSPECTION_START',
      v: START_PAYLOAD_VERSION,
      inspectionId,
      startedAtDevice,
    });
    created += 1;
  }
  return created;
}
