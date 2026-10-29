/**
 * Fixtures de domínio Sprint-3 (lista/fluxo de inspeção).
 * NÃO são mocks de cadastro OpenAPI — ver `infrastructure/api/contractMocks.ts`.
 */
import { enqueueInspectionForSync } from './draftStore';

export type InspectionStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'PENDING_SYNC';
export type InspectionPriority = 'HIGH' | 'MEDIUM' | 'LOW';

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

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function listInspections(): Promise<Inspection[]> {
  await wait(350);
  return inspections;
}

export async function getInspection(id: string): Promise<Inspection | null> {
  await wait(200);
  return inspections.find((inspection) => inspection.id === id) ?? null;
}

export async function completeInspection(id: string): Promise<void> {
  const inspection = inspections.find((item) => item.id === id);
  if (inspection) {
    inspection.status = 'PENDING_SYNC';
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
