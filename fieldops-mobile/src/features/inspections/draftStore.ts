import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { canRetry } from './syncQueue';

export type InspectionDraft = {
  answers: Record<string, string>;
  nonConformityDescription?: string;
  evidence: LocalEvidence[];
  location?: InspectionLocation;
  equipmentCode?: string;
};

export type EvidenceUploadStatus = 'UPLOADED' | 'PENDING';
export type LocalEvidence = { uri: string; capturedAt: string; itemId?: string; uploadStatus?: EvidenceUploadStatus };
export type InspectionLocation = { latitude: number; longitude: number; capturedAt: string };

export type SyncOperationStatus = 'PENDING' | 'SYNCING' | 'FAILED' | 'CONFLICT';

export type PendingOperation = {
  id: string;
  inspectionId: string;
  createdAt: string;
  status: SyncOperationStatus;
  attempts: number;
  lastError?: string;
  operationType?: string;
  payload?: string;
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
): Promise<void> {
  const draft = drafts.get(id) ?? { answers: {}, evidence: [] };
  const next = {
    ...draft,
    answers,
    nonConformityDescription: nonConformityDescription || undefined,
  };
  drafts.set(id, next);
  const persisted = queueInspectionDraftPersistence(id, next);
  void persisted.then(() => enqueueChange(id, 'ANSWERS', { answers, nonConformityDescription })).catch(() => undefined);
  return persisted;
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

export async function enqueueChange(inspectionId: string, operationType: string, payload: unknown): Promise<void> {
  const createdAt = new Date().toISOString();
  const operation: PendingOperation = {
    id: `${inspectionId}:${operationType}:${createdAt}`,
    inspectionId,
    createdAt,
    status: 'PENDING',
    attempts: 0,
    operationType,
    payload: JSON.stringify(payload),
  };
  if (Platform.OS === 'web') {
    const current = await getPendingOperations();
    if (typeof localStorage !== 'undefined') localStorage.setItem(webOutboxKey, JSON.stringify([...current, operation]));
    return;
  }
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO sync_operations (id, inspection_id, created_at, status, attempts, last_error, operation_type, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    operation.id, operation.inspectionId, operation.createdAt, operation.status, operation.attempts, null, operation.operationType ?? null, operation.payload ?? null,
  );
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
  return database.getAllAsync<PendingOperation>('SELECT id, inspection_id AS inspectionId, created_at AS createdAt, status, attempts, last_error AS lastError, operation_type AS operationType, payload FROM sync_operations ORDER BY created_at ASC');
}

export async function updateSyncOperation(id: string, status: SyncOperationStatus, lastError?: string): Promise<void> {
  if (Platform.OS === 'web') {
    const next = (await getPendingOperations()).map((operation) => operation.id === id ? { ...operation, status, attempts: operation.attempts + 1, lastError } : operation);
    if (typeof localStorage !== 'undefined') localStorage.setItem(webOutboxKey, JSON.stringify(next));
    return;
  }
  const database = await getDatabase();
  await database.runAsync('UPDATE sync_operations SET status = ?, attempts = attempts + 1, last_error = ? WHERE id = ?', status, lastError ?? null, id);
}

export async function removeSyncOperation(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    const next = (await getPendingOperations()).filter((operation) => operation.id !== id);
    if (typeof localStorage !== 'undefined') localStorage.setItem(webOutboxKey, JSON.stringify(next));
    return;
  }
  const database = await getDatabase();
  await database.runAsync('DELETE FROM sync_operations WHERE id = ?', id);
}

export async function retryFailedOperations(): Promise<number> {
  const failed = (await getPendingOperations()).filter((operation) => canRetry(operation.status));
  await Promise.all(failed.map((operation) => updateSyncOperation(operation.id, 'PENDING')));
  return failed.length;
}

export async function simulateSyncOutcome(status: Extract<SyncOperationStatus, 'FAILED' | 'CONFLICT'>): Promise<boolean> {
  const operation = (await getPendingOperations()).find((item) => item.status === 'PENDING');
  if (!operation) return false;
  const message = status === 'CONFLICT' ? 'A versão local diverge da versão aprovada no servidor.' : 'A conexão foi interrompida antes da confirmação do envio.';
  await updateSyncOperation(operation.id, status, message);
  return true;
}
