/**
 * Fixtures de domínio Sprint-3 (lista/fluxo de inspeção).
 * NÃO são mocks de cadastro OpenAPI — ver `infrastructure/api/contractMocks.ts`.
 */
import { enqueueInspectionForSync } from './draftStore';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

export type InspectionStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'PENDING_SYNC';
export type InspectionPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type ChecklistItem = {
  id: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'conformity' | 'choice' | 'date';
  required?: boolean;
  options?: string[];
};

export type ChecklistSection = {
  id: string;
  title: string;
  items: ChecklistItem[];
};

export type Inspection = {
  id: string;
  client: string;
  site: string;
  equipment: string;
  scheduledAt: string;
  priority: InspectionPriority;
  status: InspectionStatus;
  instructions: string;
};

const inspections: Inspection[] = [
  { id: 'insp-001', client: 'Usina Vale do Sol', site: 'Unidade Central', equipment: 'Transformador TR-04', scheduledAt: 'Hoje, 14:30', priority: 'HIGH', status: 'ASSIGNED', instructions: 'Verifique conexões, ruídos anormais e a temperatura do equipamento.' },
  { id: 'insp-002', client: 'Distribuidora Norte', site: 'Centro de Distribuição', equipment: 'Painel elétrico PE-12', scheduledAt: 'Hoje, 16:00', priority: 'MEDIUM', status: 'IN_PROGRESS', instructions: 'Siga o procedimento de bloqueio e etiquetagem antes de iniciar.' },
  { id: 'insp-003', client: 'Terminal Logístico Sul', site: 'Galpão 3', equipment: 'Gerador GE-07', scheduledAt: 'Amanhã, 09:00', priority: 'LOW', status: 'ASSIGNED', instructions: 'Inspecione nível de óleo, bateria e painel de controle.' },
  { id: 'insp-004', client: 'Indústria Horizonte', site: 'Linha de Produção B', equipment: 'Esteira ET-02', scheduledAt: 'Amanhã, 13:00', priority: 'HIGH', status: 'SUBMITTED', instructions: 'Aguarde a análise da supervisão.' },
];

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('fieldops.db').then(async (database) => {
      await database.execAsync('CREATE TABLE IF NOT EXISTS cached_inspections (id TEXT PRIMARY KEY NOT NULL, content TEXT NOT NULL)');
      return database;
    });
  }
  return databasePromise;
}

async function getCachedInspections(): Promise<Inspection[]> {
  if (Platform.OS === 'web') return inspections;
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ content: string }>('SELECT content FROM cached_inspections');
  if (rows.length) return rows.map((row) => JSON.parse(row.content) as Inspection);
  await Promise.all(inspections.map((inspection) => database.runAsync('INSERT INTO cached_inspections (id, content) VALUES (?, ?)', inspection.id, JSON.stringify(inspection))));
  return inspections;
}

async function persistInspection(inspection: Inspection): Promise<void> {
  if (Platform.OS === 'web') return;
  const database = await getDatabase();
  await database.runAsync('INSERT OR REPLACE INTO cached_inspections (id, content) VALUES (?, ?)', inspection.id, JSON.stringify(inspection));
}

// This fixture has the same shape as an inspection snapshot. Once the API is
// available, this repository will replace it with the downloaded snapshot.
const defaultChecklist: ChecklistSection[] = [
  {
    id: 'initial-check',
    title: 'Verificação inicial',
    items: [
      { id: 'equipment', label: 'Identificação do equipamento', type: 'text', required: true },
      { id: 'temperature', label: 'Temperatura medida (°C)', type: 'number', required: true },
      { id: 'energized', label: 'O equipamento está energizado?', type: 'boolean', required: true },
    ],
  },
  {
    id: 'operating-conditions',
    title: 'Condições operacionais',
    items: [
      { id: 'visual', label: 'Condição visual geral', type: 'conformity', required: true },
      { id: 'risk', label: 'Nível de risco observado', type: 'choice', required: true, options: ['Baixo', 'Médio', 'Alto'] },
      { id: 'date', label: 'Data da verificação', type: 'date', required: true },
      { id: 'notes', label: 'Observações', type: 'text' },
    ],
  },
];

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function listInspections(): Promise<Inspection[]> {
  await wait(350);
  return getCachedInspections();
}

export async function getInspection(id: string): Promise<Inspection | null> {
  await wait(200);
  return (await getCachedInspections()).find((inspection) => inspection.id === id) ?? null;
}

export async function getInspectionChecklist(id: string): Promise<ChecklistSection[] | null> {
  const inspection = await getInspection(id);
  return inspection ? defaultChecklist : null;
}

export async function completeInspection(id: string): Promise<void> {
  const inspection = inspections.find((item) => item.id === id);
  if (inspection) {
    inspection.status = 'PENDING_SYNC';
    await persistInspection(inspection);
    await enqueueInspectionForSync(id);
  }
}

export function getPendingSyncCount(): number {
  return inspections.filter((item) => item.status === 'PENDING_SYNC').length;
}

export async function synchronizePendingInspections(): Promise<number> {
  await wait(900);
  const pending = inspections.filter((item) => item.status === 'PENDING_SYNC');
  pending.forEach((item) => { item.status = 'SUBMITTED'; });
  return pending.length;
}
