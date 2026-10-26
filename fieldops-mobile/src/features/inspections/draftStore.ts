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

export type LocalEvidence = { uri: string; capturedAt: string; itemId?: string };
export type InspectionLocation = { latitude: number; longitude: number; capturedAt: string };

export type SyncOperationStatus = 'PENDING' | 'SYNCING' | 'FAILED' | 'CONFLICT';

export type PendingOperation = {
  id: string;
  inspectionId: string;
  createdAt: string;
  status: SyncOperationStatus;
  attempts: number;
  lastError?: string;
};

const drafts = new Map<string, InspectionDraft>();
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
  void persistInspectionDraft(id, draft);
}

async function getOrCreateDraft(id: string): Promise<InspectionDraft> {
  return (await hydrateInspectionDraft(id)) ?? { answers: {}, evidence: [] };
}

export async function addInspectionEvidence(id: string, evidence: LocalEvidence): Promise<void> {
  const draft = await getOrCreateDraft(id);
  saveInspectionDraft(id, { ...draft, evidence: [...(draft.evidence ?? []), evidence] });
}

export async function saveInspectionLocation(id: string, location: InspectionLocation): Promise<void> {
  const draft = await getOrCreateDraft(id);
  saveInspectionDraft(id, { ...draft, location });
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
  const createdAt = new Date().toISOString();
  const operation: PendingOperation = { id: `${inspectionId}:${createdAt}`, inspectionId, createdAt, status: 'PENDING', attempts: 0 };
  if (Platform.OS === 'web') {
    const current = await getPendingOperations();
    const next = [...current.filter((item) => item.inspectionId !== inspectionId), operation];
    if (typeof localStorage !== 'undefined') localStorage.setItem(webOutboxKey, JSON.stringify(next));
    return;
  }
  const database = await getDatabase();
  await database.runAsync('INSERT OR REPLACE INTO sync_operations (id, inspection_id, created_at, status, attempts, last_error) VALUES (?, ?, ?, ?, ?, ?)', operation.id, operation.inspectionId, operation.createdAt, operation.status, operation.attempts, null);
}

export async function getPendingOperations(): Promise<PendingOperation[]> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(webOutboxKey) ?? '[]') as PendingOperation[]; } catch { return []; }
  }
  const database = await getDatabase();
  return database.getAllAsync<PendingOperation>('SELECT id, inspection_id AS inspectionId, created_at AS createdAt, status, attempts, last_error AS lastError FROM sync_operations ORDER BY created_at DESC');
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
