import type { PendingOperation } from './draftStore';
import type {
  InspectionResponsePayload,
  MobileSyncOperation,
  MobileSyncOperationResult,
  MobileSyncStatus,
} from './syncPushApi';
import type { SendOutcome } from './batchSync';
import { createUuid, isUuid } from './uuid';

export type AnswerSyncPayload = {
  entityId: string;
  inspectionItemId: string;
  baseVersion?: number;
  valueText?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueDate?: string;
  conformity?: InspectionResponsePayload['conformity'];
  observation?: string;
  /** Formato legado (PBI-0050/0051.1): um saco de respostas. */
  answers?: Record<string, string>;
  nonConformityDescription?: string;
};

const CONFORMITY_LABELS: Record<string, InspectionResponsePayload['conformity']> = {
  conforme: 'CONFORMING',
  'não conforme': 'NON_CONFORMING',
  'nao conforme': 'NON_CONFORMING',
  'não aplicável': 'NOT_APPLICABLE',
  'nao aplicavel': 'NOT_APPLICABLE',
  conforming: 'CONFORMING',
  non_conforming: 'NON_CONFORMING',
  not_applicable: 'NOT_APPLICABLE',
};

export function mapAnswerValue(value: string): Pick<
  InspectionResponsePayload,
  'valueText' | 'valueNumber' | 'valueBoolean' | 'valueDate' | 'conformity'
> {
  const trimmed = value.trim();
  const conformity = CONFORMITY_LABELS[trimmed.toLowerCase()];
  if (conformity) return { conformity };

  if (/^(sim|true|yes)$/i.test(trimmed)) return { valueBoolean: true };
  if (/^(não|nao|false|no)$/i.test(trimmed)) return { valueBoolean: false };

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return { valueNumber: Number(trimmed) };

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { valueDate: trimmed };

  return { valueText: trimmed };
}

export function parseAnswerSyncPayload(payload?: string): AnswerSyncPayload | null {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as AnswerSyncPayload;
  } catch {
    return null;
  }
}

export function toMobileSyncOperation(operation: PendingOperation): MobileSyncOperation | null {
  if (operation.operationType !== 'ANSWERS') return null;
  if (!isUuid(operation.id)) return null;

  const parsed = parseAnswerSyncPayload(operation.payload);
  if (!parsed?.inspectionItemId || !isUuid(parsed.inspectionItemId)) return null;

  const entityId = parsed.entityId && isUuid(parsed.entityId) ? parsed.entityId : createUuid();
  const payload: InspectionResponsePayload = {
    inspectionItemId: parsed.inspectionItemId,
    valueText: parsed.valueText,
    valueNumber: parsed.valueNumber,
    valueBoolean: parsed.valueBoolean,
    valueDate: parsed.valueDate,
    conformity: parsed.conformity,
    observation: parsed.observation,
  };

  return {
    operationId: operation.id,
    entityType: 'INSPECTION_RESPONSE',
    entityId,
    operationType: 'UPSERT',
    baseVersion: parsed.baseVersion ?? 0,
    payload,
  };
}

export function receiptMessage(status: MobileSyncStatus, entityVersion?: number | null): string {
  switch (status) {
    case 'CONFLICT':
      return entityVersion == null
        ? 'A versão local diverge da versão no servidor.'
        : `Conflito com a versão ${entityVersion} no servidor. A alteração local foi preservada.`;
    case 'REJECTED':
      return 'O servidor rejeitou a operação.';
    case 'DEPENDENCY_FAILED':
      return 'A operação ficou bloqueada por falha em uma dependência.';
    default:
      return 'Não foi possível confirmar a operação.';
  }
}

export function mapSyncReceipt(result: MobileSyncOperationResult): SendOutcome {
  if (result.status === 'APPLIED' || result.status === 'ALREADY_APPLIED') {
    return { kind: 'applied' };
  }
  if (result.status === 'CONFLICT') {
    return { kind: 'conflict', message: receiptMessage(result.status, result.entityVersion) };
  }
  return { kind: 'failed', message: receiptMessage(result.status, result.entityVersion) };
}
