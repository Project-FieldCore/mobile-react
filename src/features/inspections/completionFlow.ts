/**
 * Fluxos de conclusão offline-first (modo API) com dependências injetáveis
 * para teste em Node:
 *  - `completeInspectionOfflineFirst`: tenta concluir online; se a rede falhar,
 *    salva na outbox (COMPLETE) e marca PENDING_SYNC.
 *  - `sendCompletionOperation`: envia a conclusão pendente no sync, de forma
 *    idempotente (reenvio com o mesmo operationId nunca duplica).
 */
import { ApiError } from '@/infrastructure/api/client';
import { isNetworkUnavailableError } from '@/infrastructure/api/errorResponse';
import type { SendOutcome } from './batchSync';
import {
  buildCompletionAnswers,
  COMPLETION_PAYLOAD_VERSION,
  findMissingObservation,
  parseCompletionPayload,
  type CompletionAnswer,
  type CompletionPayload,
  type CompletionSignature,
} from './completionOutbox';
import { describeSyncError } from './syncErrorMessage';
import type { ChecklistSection, Inspection } from './mockRepository';
import type { PendingOperation } from './draftStore';

type Location = { latitude: number; longitude: number };
type CapturedLocation = Location & { capturedAt: string };

export type CompleteRemote = (
  id: string,
  version: number,
  answers: CompletionAnswer[],
  location: Location | undefined,
  signature: CompletionSignature | undefined,
  completedAtDevice: string,
  operationId?: string,
) => Promise<void>;

export type CompleteFlowDeps = {
  getCachedInspection: (id: string) => Promise<Inspection | null>;
  getCachedChecklist: (id: string) => Promise<ChecklistSection[] | null>;
  fetchChecklist: (id: string) => Promise<ChecklistSection[]>;
  fetchInspection: (id: string) => Promise<Inspection | null>;
  getDraft: (id: string) => Promise<{ answers: Record<string, string>; nonConformityDescription?: string; baseVersion?: number } | undefined>;
  captureLocation: () => Promise<CapturedLocation | undefined>;
  saveLocation: (id: string, location: CapturedLocation) => Promise<void>;
  completeRemote: CompleteRemote;
  enqueueCompletion: (inspectionId: string, payload: Omit<CompletionPayload, 'operationId'>) => Promise<string>;
  markPendingSync: (id: string) => Promise<void>;
  markSubmitted: (id: string) => Promise<void>;
  removeDeliveredOperations: (id: string) => Promise<void>;
  now: () => string;
};

export type CompleteResult = { coordinatesSent: boolean; queued: boolean };

function isVersionConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === 'VERSION_CONFLICT';
}

/**
 * Conclui a inspeção. Erros de negócio (4xx/5xx) continuam sendo erro; só
 * indisponibilidade de rede/timeout vira conclusão local pendente.
 * Não faz chamadas de rede antes de tentar concluir: usa checklist/versão locais.
 */
export async function completeInspectionOfflineFirst(
  id: string,
  signature: CompletionSignature | undefined,
  deps: CompleteFlowDeps,
): Promise<CompleteResult> {
  const [cachedInspection, draft] = await Promise.all([deps.getCachedInspection(id), deps.getDraft(id)]);
  const checklist = (await deps.getCachedChecklist(id)) ?? (await deps.fetchChecklist(id));

  const missing = findMissingObservation(checklist, draft);
  if (missing) throw new Error(`${missing} exige uma observação.`);

  const answers = buildCompletionAnswers(checklist, draft);
  const location = await deps.captureLocation();
  if (location) await deps.saveLocation(id, location);
  const completedAtDevice = deps.now();
  const coordinatesSent = Boolean(location);

  const queue = async (baseVersion: number): Promise<CompleteResult> => {
    await deps.enqueueCompletion(id, {
      kind: 'INSPECTION_COMPLETION',
      v: COMPLETION_PAYLOAD_VERSION,
      inspectionId: id,
      baseVersion,
      completedAtDevice,
      answers,
      latitude: location?.latitude,
      longitude: location?.longitude,
      signature,
    });
    await deps.markPendingSync(id);
    return { coordinatesSent, queued: true };
  };

  const send = (version: number) => deps.completeRemote(id, version, answers, location, signature, completedAtDevice);
  let version = cachedInspection?.version ?? draft?.baseVersion ?? 0;

  try {
    await send(version);
  } catch (error) {
    if (isNetworkUnavailableError(error)) return queue(version);
    if (!isVersionConflict(error)) throw error;

    // Versão local desatualizada com a rede disponível: renova uma vez e repete.
    try {
      const fresh = await deps.fetchInspection(id);
      version = fresh?.version ?? version;
      await send(version);
    } catch (retryError) {
      if (isNetworkUnavailableError(retryError)) return queue(version);
      throw retryError;
    }
  }

  await deps.removeDeliveredOperations(id);
  await deps.markSubmitted(id).catch(() => undefined);
  return { coordinatesSent, queued: false };
}

export type SendCompletionDeps = {
  fetchInspection: (id: string) => Promise<Inspection | null>;
  completeRemote: CompleteRemote;
  markSubmitted: (id: string) => Promise<void>;
  removeDeliveredOperations: (id: string) => Promise<void>;
};

/** Estados em que o servidor já recebeu a conclusão (ALREADY_APPLIED). */
const ALREADY_COMPLETED = new Set(['SUBMITTED', 'APPROVED', 'REJECTED']);

async function applied(inspectionId: string, deps: SendCompletionDeps): Promise<SendOutcome> {
  await deps.removeDeliveredOperations(inspectionId);
  await deps.markSubmitted(inspectionId).catch(() => undefined);
  return { kind: 'applied' };
}

/**
 * Envia a conclusão pendente. Idempotente: se o servidor já não está EM
 * ANDAMENTO por ter recebido esta conclusão (ex.: resposta perdida no envio
 * anterior), trata como aplicada sem reenviar. Falhas de rede propagam (a
 * operação fica FAILED e pode ser reenviada com o mesmo operationId).
 */
export async function sendCompletionOperation(
  operation: PendingOperation,
  deps: SendCompletionDeps,
): Promise<SendOutcome> {
  const payload = parseCompletionPayload(operation.payload);
  if (!payload) return { kind: 'failed', message: 'A operação de conclusão está incompleta.' };

  const location = payload.latitude != null && payload.longitude != null
    ? { latitude: payload.latitude, longitude: payload.longitude }
    : undefined;

  const server = await deps.fetchInspection(payload.inspectionId);
  const verdict = classifyServerState(server);
  if (verdict) return verdict.kind === 'applied' ? applied(payload.inspectionId, deps) : verdict;

  // Respostas já foram enviadas antes (ordem da outbox) e cada push incrementa a versão:
  // usa a versão atual do servidor, que é a que o endpoint exige.
  let version = server?.version ?? payload.baseVersion;
  const send = () => deps.completeRemote(
    payload.inspectionId, version, payload.answers, location, payload.signature, payload.completedAtDevice, operation.id,
  );

  try {
    try {
      await send();
    } catch (error) {
      if (!isVersionConflict(error)) throw error;
      const fresh = await deps.fetchInspection(payload.inspectionId);
      const freshVerdict = classifyServerState(fresh);
      if (freshVerdict) return freshVerdict.kind === 'applied' ? applied(payload.inspectionId, deps) : freshVerdict;
      version = fresh?.version ?? version;
      await send();
    }
  } catch (error) {
    if (isNetworkUnavailableError(error)) throw error;
    if (error instanceof ApiError && error.status === 409 && error.code === 'INSPECTION_NOT_IN_PROGRESS') {
      const current = await deps.fetchInspection(payload.inspectionId);
      const currentVerdict = classifyServerState(current);
      if (currentVerdict?.kind === 'applied') return applied(payload.inspectionId, deps);
    }
    return { kind: 'failed', message: describeSyncError(error, 'Não foi possível concluir a inspeção.') };
  }

  return applied(payload.inspectionId, deps);
}

/** `null` = servidor ainda EM ANDAMENTO (precisa enviar). */
function classifyServerState(server: Inspection | null): SendOutcome | null {
  if (!server) return { kind: 'failed', message: 'A inspeção não foi encontrada no servidor.' };
  if (server.status === 'IN_PROGRESS') return null;
  if (ALREADY_COMPLETED.has(server.status)) return { kind: 'applied' };
  if (server.status === 'CANCELED') return { kind: 'failed', message: 'A inspeção foi cancelada no servidor; a conclusão não foi aplicada.' };
  return { kind: 'failed', message: 'A inspeção ainda não foi iniciada no servidor; a conclusão não pôde ser enviada.' };
}
