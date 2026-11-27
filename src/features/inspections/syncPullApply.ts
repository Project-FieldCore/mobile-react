import { clearInspectionDraft, mergeServerAnswers } from './draftStore';
import {
  deleteDownloadedInspection,
  readDownloadedInspections,
  saveDownloadedChecklist,
  saveDownloadedInspection,
} from './mockRepository';
import type {
  MobileSyncChange,
  MobileSyncInspectionPayload,
  MobileSyncResponsePayload,
} from './syncPullApi';
import {
  responseValueToAnswer,
  toChecklistSections,
  toMobileInspectionFromPull,
} from './syncPullMapper';

export type ApplyPullPageResult = {
  upsertedInspections: number;
  upsertedResponses: number;
  deletedInspections: number;
};

function isInspectionPayload(payload: MobileSyncChange['payload']): payload is MobileSyncInspectionPayload {
  return Boolean(payload && 'items' in payload && Array.isArray(payload.items));
}

function isResponsePayload(payload: MobileSyncChange['payload']): payload is MobileSyncResponsePayload {
  return Boolean(payload && 'inspectionItemId' in payload && 'inspectionId' in payload);
}

async function applyInspectionUpsert(change: MobileSyncChange): Promise<boolean> {
  if (!isInspectionPayload(change.payload)) return false;
  const existing = (await readDownloadedInspections()).find((item) => item.id === change.payload!.id) ?? null;
  const inspection = toMobileInspectionFromPull(change.payload, existing);
  await saveDownloadedInspection(inspection);
  await saveDownloadedChecklist(inspection.id, toChecklistSections(change.payload.items));
  return true;
}

async function applyResponseUpsert(change: MobileSyncChange): Promise<boolean> {
  if (!isResponsePayload(change.payload)) return false;
  const answer = responseValueToAnswer(change.payload);
  if (answer == null) return false;
  await mergeServerAnswers(
    change.payload.inspectionId,
    { [change.payload.inspectionItemId]: answer },
    change.payload.observation ?? undefined,
    change.payload.version,
  );
  return true;
}

async function applyInspectionDelete(change: MobileSyncChange): Promise<boolean> {
  // Envelope entityId = inspection to drop (not the tombstone/stream key).
  await deleteDownloadedInspection(change.entityId);
  clearInspectionDraft(change.entityId);
  return true;
}

/** Aplica uma página de mudanças de forma idempotente (UPSERT/DELETE). */
export async function applyPullChanges(changes: MobileSyncChange[]): Promise<ApplyPullPageResult> {
  const result: ApplyPullPageResult = {
    upsertedInspections: 0,
    upsertedResponses: 0,
    deletedInspections: 0,
  };

  for (const change of changes) {
    if (change.entityType === 'INSPECTION' && change.operation === 'UPSERT') {
      if (await applyInspectionUpsert(change)) result.upsertedInspections += 1;
      continue;
    }
    if (change.entityType === 'INSPECTION_RESPONSE' && change.operation === 'UPSERT') {
      if (await applyResponseUpsert(change)) result.upsertedResponses += 1;
      continue;
    }
    if (change.entityType === 'INSPECTION' && change.operation === 'DELETE') {
      if (await applyInspectionDelete(change)) result.deletedInspections += 1;
    }
  }

  return result;
}
