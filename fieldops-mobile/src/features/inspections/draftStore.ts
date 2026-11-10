import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { canRetry } from './syncQueue';
import { mapAnswerValue } from './syncPushMapper';
import { createUuid, isUuid } from './uuid';

export type InspectionDraft = {
  answers: Record<string, string>;
  nonConformityDescription?: string;
  evidence: LocalEvidence[];
  location?: InspectionLocation;
  equipmentCode?: string;
  baseVersion?: number;
};

export type EvidenceUploadStatus = 'UPLOADED' | 'PENDING';
export type LocalEvidence = { uri: string; capturedAt: string; itemId?: string; uploadStatus?: EvidenceUploadStatus };
export type InspectionLocation = { latitude: number; longitude: number; capturedAt: string };

export type SyncOperationStatus = 'PENDING' | 'SYNCING' | 'FAILED' | 'CONFLICT';

export type ConflictServerSnapshot = {
  id?: string | null;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueDate?: string | null;
  conformity?: string | null;
  observation?: string | null;
};

export type PendingOperation = {
  id: string;
  inspectionId: string;
  createdAt: string;
  status: SyncOperationStatus;
  attempts: number;
  lastError?: string;
  operationType?: string;
  payload?: string;
  conflictEntityVersion?: number | null;
  conflictServer?: ConflictServerSnapshot | null;
  conflictAt?: string;
};

const drafts = new Map<string, InspectionDraft>();
const draftPersistenceQueues = new Map<string, Promise<void>>();
const webDraftsKey = 'fieldops.inspection-drafts';
const webOutboxKey = 'fieldops.sync-outbox';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('fieldops.db').then(async (database) => {
      await database.execAsync(`CREATE TABLE IF NOT EXISTS inspection_drafts (inspection_id TEXT PRIMARY KEY NOT NULL, content TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sync_outbox (inspection_id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sync_operations (id TEXT PRIMARY KEY NOT NULL, inspection_id TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT);
        INSERT OR IGNORE INTO sync_operations (id, inspection_id, created_at, status, attempts)
          SELECT inspection_id || ':' || created_at, inspection_id, created_at, 'PENDING', 0 FROM sync_outbox;`);
      const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(sync_operations)');
      if (!columns.some((column) => column.name === 'operation_type')) {
        await database.execAsync('ALTER TABLE sync_operations ADD COLUMN operation_type TEXT');
        await database.execAsync('ALTER TABLE sync_operations ADD COLUMN payload TEXT');
      }
      if (!columns.some((column) => column.name === 'conflict_entity_version')) {
        await database.execAsync('ALTER TABLE sync_operations ADD COLUMN conflict_entity_version INTEGER');
        await database.execAsync('ALTER TABLE sync_operations ADD COLUMN conflict_server TEXT');
        await database.execAsync('ALTER TABLE sync_operations ADD COLUMN conflict_at TEXT');
      }
      return database;
    });
  }
  return databasePromise;
}

function readWebDrafts(): Record<string, InspectionDraft> {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(webDraftsKey) ?? '{}') as Record<string, InspectionDraft>; } catch { return {}; }
}

function writeWebDrafts(value: Record<string, InspectionDraft>) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(webDraftsKey, JSON.stringify(value));
}

async function writeWebOutbox(operations: PendingOperation[]) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(webOutboxKey, JSON.stringify(operations));
}

export function saveInspectionDraft(id: string, draft: InspectionDraft) {
  drafts.set(id, draft);
  queueInspectionDraftPersistence(id, draft);
}

/**
 * Persiste o estado completo do checklist sem descartar dados coletados em
 * outras etapas (foto, GPS e identificação do equipamento).
 */
export function saveInspectionAnswers(
  id: string,
  answers: Record<string, string>,
  nonConformityDescription: string,
  baseVersion?: number,
): Promise<void> {
  const draft = drafts.get(id) ?? { answers: {}, evidence: [] };
  const next = {
    ...draft,
    answers,
    nonConformityDescription: nonConformityDescription || undefined,
    baseVersion: baseVersion ?? draft.baseVersion,
  };
  drafts.set(id, next);
  const persisted = queueInspectionDraftPersistence(id, next);
  void persisted
    .then(() => enqueueAnswerOperations(id, answers, nonConformityDescription, next.baseVersion ?? 0))
    .catch(() => undefined);
  return persisted;
}

/**
 * Aplica respostas vindas do pull sem enfileirar na outbox (evita eco no push).
 */
export async function mergeServerAnswers(
  id: string,
  answers: Record<string, string>,
  nonConformityDescription?: string,
  baseVersion?: number,
): Promise<void> {
  const draft = (await hydrateInspectionDraft(id)) ?? { answers: {}, evidence: [] };
  const next: InspectionDraft = {
    ...draft,
    answers: { ...draft.answers, ...answers },
    nonConformityDescription: nonConformityDescription || draft.nonConformityDescription,
    baseVersion: baseVersion ?? draft.baseVersion,
  };
  drafts.set(id, next);
  await queueInspectionDraftPersistence(id, next);
}

async function getOrCreateDraft(id: string): Promise<InspectionDraft> {
  return (await hydrateInspectionDraft(id)) ?? { answers: {}, evidence: [] };
}

export async function addInspectionEvidence(id: string, evidence: LocalEvidence): Promise<void> {
  const draft = await getOrCreateDraft(id);
  saveInspectionDraft(id, { ...draft, evidence: [...(draft.evidence ?? []), evidence] });
  await enqueueChange(id, 'EVIDENCE', evidence);
}

export async function setEvidenceUploadStatus(id: string, uri: string, uploadStatus: EvidenceUploadStatus): Promise<void> {
  const draft = await getOrCreateDraft(id);
  saveInspectionDraft(id, {
    ...draft,
    evidence: (draft.evidence ?? []).map((item) => item.uri === uri ? { ...item, uploadStatus } : item),
  });
}

export async function saveInspectionLocation(id: string, location: InspectionLocation): Promise<void> {
  const draft = await getOrCreateDraft(id);
  saveInspectionDraft(id, { ...draft, location });
  await enqueueChange(id, 'LOCATION', location);
}

export async function saveEquipmentIdentification(id: string, equipmentCode: string): Promise<void> {
  const draft = await getOrCreateDraft(id);
  saveInspectionDraft(id, { ...draft, equipmentCode });
}

export function getInspectionDraft(id: string): InspectionDraft | undefined {
  return drafts.get(id);
}

export function clearInspectionDraft(id: string) {
  drafts.delete(id);
  void removePersistedInspectionDraft(id);
}

export async function hydrateInspectionDraft(id: string): Promise<InspectionDraft | undefined> {
  if (Platform.OS === 'web') {
    const draft = readWebDrafts()[id];
    if (draft) drafts.set(id, draft);
    return draft;
  }
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ content: string }>('SELECT content FROM inspection_drafts WHERE inspection_id = ?', id);
  if (!row) return undefined;
  const draft = JSON.parse(row.content) as InspectionDraft;
  drafts.set(id, draft);
  return draft;
}

function queueInspectionDraftPersistence(id: string, draft: InspectionDraft): Promise<void> {
  const previous = draftPersistenceQueues.get(id) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => persistInspectionDraft(id, draft));

  draftPersistenceQueues.set(id, next);
  void next
    .catch(() => undefined)
    .finally(() => {
      if (draftPersistenceQueues.get(id) === next) draftPersistenceQueues.delete(id);
    });
  return next;
}

async function persistInspectionDraft(id: string, draft: InspectionDraft) {
  if (Platform.OS === 'web') {
    writeWebDrafts({ ...readWebDrafts(), [id]: draft });
    return;
  }
  const database = await getDatabase();
  await database.runAsync('INSERT OR REPLACE INTO inspection_drafts (inspection_id, content, updated_at) VALUES (?, ?, ?)', id, JSON.stringify(draft), new Date().toISOString());
}

async function removePersistedInspectionDraft(id: string) {
  if (Platform.OS === 'web') {
    const draftsById = readWebDrafts();
    delete draftsById[id];
    writeWebDrafts(draftsById);
    return;
  }
  const database = await getDatabase();
  await database.runAsync('DELETE FROM inspection_drafts WHERE inspection_id = ?', id);
}

export async function enqueueInspectionForSync(inspectionId: string) {
  await enqueueChange(inspectionId, 'COMPLETE', { inspectionId });
}

/** Uma linha de outbox por item — alinhado a INSPECTION_RESPONSE no sync push. */
export async function enqueueAnswerOperations(
  inspectionId: string,
  answers: Record<string, string>,
  nonConformityDescription: string,
  baseVersion = 0,
): Promise<void> {
  const pending = await getPendingOperations();
  const existingByItem = new Map<string, PendingOperation>();
  for (const operation of pending) {
    if (operation.inspectionId !== inspectionId || operation.operationType !== 'ANSWERS') continue;
    try {
      const payload = JSON.parse(operation.payload ?? '{}') as { inspectionItemId?: string };
      if (payload.inspectionItemId) existingByItem.set(payload.inspectionItemId, operation);
    } catch {
      /* ignore malformed */
    }
  }

  for (const [itemId, value] of Object.entries(answers)) {
    if (!value) continue;
    const fields = mapAnswerValue(value);
    const observation = fields.conformity === 'NON_CONFORMING'
      ? (nonConformityDescription || undefined)
      : undefined;
    const existing = existingByItem.get(itemId);
    if (existing) {
      let previous: { entityId?: string; baseVersion?: number } = {};
      try {
        previous = JSON.parse(existing.payload ?? '{}') as { entityId?: string; baseVersion?: number };
      } catch {
        previous = {};
      }
      await replaceSyncOperationPayload(existing.id, {
        entityId: previous.entityId && isUuid(previous.entityId) ? previous.entityId : createUuid(),
        inspectionItemId: itemId,
        baseVersion: previous.baseVersion ?? baseVersion,
        ...fields,
        observation,
      });
      if (existing.status === 'FAILED' || existing.status === 'CONFLICT') {
        await updateSyncOperation(existing.id, 'PENDING', undefined, false);
      }
      continue;
    }

    await enqueueChange(inspectionId, 'ANSWERS', {
      entityId: createUuid(),
      inspectionItemId: itemId,
      baseVersion,
      ...fields,
      observation,
    });
  }
}

export async function enqueueChange(inspectionId: string, operationType: string, payload: unknown): Promise<void> {
  const createdAt = new Date().toISOString();
  const operation: PendingOperation = {
    id: createUuid(),
    inspectionId,
    createdAt,
    status: 'PENDING',
    attempts: 0,
    operationType,
    payload: JSON.stringify(payload),
  };
  await enqueueRawSyncOperation(operation);
}

export async function enqueueRawSyncOperation(operation: PendingOperation): Promise<void> {
  if (Platform.OS === 'web') {
    const current = await getPendingOperations();
    await writeWebOutbox([...current, operation]);
    return;
  }
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO sync_operations (id, inspection_id, created_at, status, attempts, last_error, operation_type, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    operation.id, operation.inspectionId, operation.createdAt, operation.status, operation.attempts, operation.lastError ?? null, operation.operationType ?? null, operation.payload ?? null,
  );
}

function mapSyncRow(row: {
  id: string;
  inspectionId: string;
  createdAt: string;
  status: SyncOperationStatus;
  attempts: number;
  lastError?: string | null;
  operationType?: string | null;
  payload?: string | null;
  conflictEntityVersion?: number | null;
  conflictServer?: string | null;
  conflictAt?: string | null;
}): PendingOperation {
  let conflictServer: ConflictServerSnapshot | null | undefined;
  if (row.conflictServer) {
    try {
      conflictServer = JSON.parse(row.conflictServer) as ConflictServerSnapshot;
    } catch {
      conflictServer = null;
    }
  }
  return {
    id: row.id,
    inspectionId: row.inspectionId,
    createdAt: row.createdAt,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError ?? undefined,
    operationType: row.operationType ?? undefined,
    payload: row.payload ?? undefined,
    conflictEntityVersion: row.conflictEntityVersion ?? null,
    conflictServer: conflictServer ?? null,
    conflictAt: row.conflictAt ?? undefined,
  };
}

export async function getPendingOperations(): Promise<PendingOperation[]> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return [];
    try {
      const operations = JSON.parse(localStorage.getItem(webOutboxKey) ?? '[]') as PendingOperation[];
      return operations.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    } catch { return []; }
  }
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    inspectionId: string;
    createdAt: string;
    status: SyncOperationStatus;
    attempts: number;
    lastError?: string | null;
    operationType?: string | null;
    payload?: string | null;
    conflictEntityVersion?: number | null;
    conflictServer?: string | null;
    conflictAt?: string | null;
  }>('SELECT id, inspection_id AS inspectionId, created_at AS createdAt, status, attempts, last_error AS lastError, operation_type AS operationType, payload, conflict_entity_version AS conflictEntityVersion, conflict_server AS conflictServer, conflict_at AS conflictAt FROM sync_operations ORDER BY created_at ASC');
  return rows.map(mapSyncRow);
}

export async function getSyncOperationById(id: string): Promise<PendingOperation | null> {
  const operations = await getPendingOperations();
  return operations.find((operation) => operation.id === id) ?? null;
}

export async function recordConflictOperation(
  id: string,
  lastError: string,
  entityVersion: number | null | undefined,
  server: ConflictServerSnapshot | null | undefined,
): Promise<void> {
  const conflictAt = new Date().toISOString();
  const serializedServer = server == null ? null : JSON.stringify(server);
  if (Platform.OS === 'web') {
    const next = (await getPendingOperations()).map((operation) => (
      operation.id === id
        ? {
          ...operation,
          status: 'CONFLICT' as const,
          attempts: operation.attempts + 1,
          lastError,
          conflictEntityVersion: entityVersion ?? null,
          conflictServer: server ?? null,
          conflictAt,
        }
        : operation
    ));
    await writeWebOutbox(next);
    return;
  }
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE sync_operations SET status = ?, attempts = attempts + 1, last_error = ?, conflict_entity_version = ?, conflict_server = ?, conflict_at = ? WHERE id = ?',
    'CONFLICT',
    lastError,
    entityVersion ?? null,
    serializedServer,
    conflictAt,
    id,
  );
}

export async function clearConflictMetadata(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    const next = (await getPendingOperations()).map((operation) => (
      operation.id === id
        ? {
          ...operation,
          conflictEntityVersion: null,
          conflictServer: null,
          conflictAt: undefined,
        }
        : operation
    ));
    await writeWebOutbox(next);
    return;
  }
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE sync_operations SET conflict_entity_version = NULL, conflict_server = NULL, conflict_at = NULL WHERE id = ?',
    id,
  );
}

export async function updateSyncOperation(
  id: string,
  status: SyncOperationStatus,
  lastError?: string,
  bumpAttempts = true,
): Promise<void> {
  if (Platform.OS === 'web') {
    const next = (await getPendingOperations()).map((operation) => {
      if (operation.id !== id) return operation;
      return {
        ...operation,
        status,
        attempts: bumpAttempts ? operation.attempts + 1 : operation.attempts,
        lastError,
      };
    });
    await writeWebOutbox(next);
    return;
  }
  const database = await getDatabase();
  if (bumpAttempts) {
    await database.runAsync('UPDATE sync_operations SET status = ?, attempts = attempts + 1, last_error = ? WHERE id = ?', status, lastError ?? null, id);
    return;
  }
  await database.runAsync('UPDATE sync_operations SET status = ?, last_error = ? WHERE id = ?', status, lastError ?? null, id);
}

export async function replaceSyncOperationPayload(id: string, payload: unknown): Promise<void> {
  const serialized = JSON.stringify(payload);
  if (Platform.OS === 'web') {
    const next = (await getPendingOperations()).map((operation) => (
      operation.id === id ? { ...operation, payload: serialized } : operation
    ));
    await writeWebOutbox(next);
    return;
  }
  const database = await getDatabase();
  await database.runAsync('UPDATE sync_operations SET payload = ? WHERE id = ?', serialized, id);
}

export async function rekeySyncOperation(oldId: string, newId: string): Promise<PendingOperation | null> {
  const operations = await getPendingOperations();
  const current = operations.find((operation) => operation.id === oldId);
  if (!current) return null;
  const nextOperation = { ...current, id: newId };
  if (Platform.OS === 'web') {
    await writeWebOutbox(operations.map((operation) => (operation.id === oldId ? nextOperation : operation)));
    return nextOperation;
  }
  const database = await getDatabase();
  await database.runAsync('UPDATE sync_operations SET id = ? WHERE id = ?', newId, oldId);
  return nextOperation;
}

export async function removeSyncOperation(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    const next = (await getPendingOperations()).filter((operation) => operation.id !== id);
    await writeWebOutbox(next);
    return;
  }
  const database = await getDatabase();
  await database.runAsync('DELETE FROM sync_operations WHERE id = ?', id);
}

export async function retryFailedOperations(): Promise<number> {
  const failed = (await getPendingOperations()).filter((operation) => canRetry(operation.status));
  await Promise.all(failed.map((operation) => updateSyncOperation(operation.id, 'PENDING', undefined, false)));
  return failed.length;
}

export async function simulateSyncOutcome(status: Extract<SyncOperationStatus, 'FAILED' | 'CONFLICT'>): Promise<boolean> {
  const operation = (await getPendingOperations()).find((item) => item.status === 'PENDING');
  if (!operation) return false;
  if (status === 'CONFLICT') {
    let localValue: ConflictServerSnapshot = { valueText: 'local' };
    try {
      const payload = JSON.parse(operation.payload ?? '{}') as ConflictServerSnapshot & {
        valueText?: string;
        valueBoolean?: boolean;
        conformity?: string;
      };
      localValue = {
        valueText: payload.valueText ?? 'local',
        valueBoolean: payload.valueBoolean,
        conformity: payload.conformity,
        observation: payload.observation ?? null,
      };
    } catch {
      /* keep default */
    }
    await recordConflictOperation(
      operation.id,
      'A versão local diverge da versão aprovada no servidor.',
      1,
      {
        valueText: localValue.valueText === 'local' ? 'servidor' : 'valor no servidor',
        valueBoolean: typeof localValue.valueBoolean === 'boolean' ? !localValue.valueBoolean : false,
        observation: 'snapshot simulado',
      },
    );
    return true;
  }
  await updateSyncOperation(operation.id, status, 'A conexão foi interrompida antes da confirmação do envio.');
  return true;
}
