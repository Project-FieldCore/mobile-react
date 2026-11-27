/**
 * Conclusão de inspeção offline-first (modo API).
 *
 * Tipos e funções puras da operação `COMPLETE` da outbox. O servidor aplica o
 * `/mobile/sync/push` apenas para INSPECTION_RESPONSE; a conclusão sobe pelo
 * endpoint dedicado `POST /inspections/my/{id}/complete` (ver `completionFlow`).
 */
import type { ChecklistSection, Inspection } from './mockRepository';
import type { PendingOperation } from './draftStore';
import { parseStartPayload } from './startOutbox';

export const COMPLETION_PAYLOAD_VERSION = 1;

export type CompletionAnswer = {
  itemId: string;
  valueText?: string;
  conformity?: 'NON_CONFORMING' | 'CONFORMING' | 'NOT_APPLICABLE';
  observation?: string;
};

export type CompletionSignature = { contentType: 'image/png'; dataBase64: string };

/** Payload persistido na outbox (JSON) para a operação COMPLETE. */
export type CompletionPayload = {
  kind: 'INSPECTION_COMPLETION';
  v: typeof COMPLETION_PAYLOAD_VERSION;
  /** Igual ao `id` da linha da outbox: estável entre reenvios. */
  operationId: string;
  inspectionId: string;
  /** Versão da inspeção conhecida no aparelho quando o técnico concluiu. */
  baseVersion: number;
  /** Instante real da conclusão no aparelho (ISO-8601). */
  completedAtDevice: string;
  answers: CompletionAnswer[];
  latitude?: number;
  longitude?: number;
  signature?: CompletionSignature;
};

type DraftLike = { answers: Record<string, string>; nonConformityDescription?: string } | undefined;

const CONFORMITY_BY_ANSWER: Record<string, CompletionAnswer['conformity']> = {
  'Não conforme': 'NON_CONFORMING',
  Conforme: 'CONFORMING',
  'Não aplicável': 'NOT_APPLICABLE',
};

export function buildCompletionAnswers(checklist: ChecklistSection[], draft: DraftLike): CompletionAnswer[] {
  return checklist.flatMap((section) => section.items).map((item) => ({
    itemId: item.id,
    valueText: draft?.answers[item.id],
    conformity: CONFORMITY_BY_ANSWER[draft?.answers[item.id] ?? ''],
    observation: draft?.nonConformityDescription,
  }));
}

/** Primeiro item exigindo observação (não conforme sem descrição), se houver. */
export function findMissingObservation(checklist: ChecklistSection[], draft: DraftLike): string | null {
  for (const item of checklist.flatMap((section) => section.items)) {
    if (item.observationRequired && draft?.answers[item.id] === 'Não conforme' && !draft.nonConformityDescription?.trim()) {
      return item.label;
    }
  }
  return null;
}

export function parseCompletionPayload(payload?: string): CompletionPayload | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as Partial<CompletionPayload>;
    if (parsed.kind !== 'INSPECTION_COMPLETION' || parsed.v !== COMPLETION_PAYLOAD_VERSION) return null;
    if (typeof parsed.inspectionId !== 'string' || !Array.isArray(parsed.answers)) return null;
    if (typeof parsed.operationId !== 'string' || typeof parsed.completedAtDevice !== 'string') return null;
    return parsed as CompletionPayload;
  } catch {
    return null;
  }
}

export function isCompletionOperation(operation: PendingOperation): boolean {
  return operation.operationType === 'COMPLETE' && parseCompletionPayload(operation.payload) !== null;
}

/**
 * Enquanto houver início/conclusão pendente, a inspeção reflete o estado local
 * mesmo que o servidor ainda a veja ATRIBUÍDA/EM ANDAMENTO (ex.: lista baixada
 * online antes de sincronizar): início pendente → "Em andamento";
 * conclusão pendente → "Aguardando sincronização".
 */
export function applyPendingCompletionStatus(
  inspections: Inspection[],
  operations: PendingOperation[],
): Inspection[] {
  const completing = new Set(operations.filter(isCompletionOperation).map((operation) => operation.inspectionId));
  const starting = new Set(
    operations.filter((operation) => operation.operationType === 'START' && parseStartPayload(operation.payload) !== null)
      .map((operation) => operation.inspectionId),
  );
  if (completing.size === 0 && starting.size === 0) return inspections;
  return inspections.map((inspection) => {
    if (completing.has(inspection.id) && (inspection.status === 'IN_PROGRESS' || inspection.status === 'ASSIGNED')) {
      return { ...inspection, status: 'PENDING_SYNC' as const };
    }
    if (starting.has(inspection.id) && inspection.status === 'ASSIGNED') {
      return { ...inspection, status: 'IN_PROGRESS' as const };
    }
    return inspection;
  });
}
