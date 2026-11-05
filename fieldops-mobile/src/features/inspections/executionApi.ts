import { dataSource } from '@/config/dataSource';
import { apiRequest, apiUpload } from '@/infrastructure/api/client';
import { getSession } from '@/infrastructure/storage/session';
import type { ChecklistSection, Inspection, InspectionPriority, InspectionStatus } from './mockRepository';

type ApiAssigned = {
  id: string;
  clientName: string;
  siteName: string;
  equipmentName?: string | null;
  title: string;
  instructions?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED';
  scheduledFor: string;
  startedAt?: string | null;
  version: number;
};

type ApiItem = {
  id: string;
  title: string;
  description?: string | null;
  responseType: string;
  required: boolean;
  rulesJson?: string | null;
  optionsJson?: string | null;
};

type ApiSection = { title: string; order: number; items: ApiItem[] };

const PRIORITY: Record<ApiAssigned['priority'], InspectionPriority> = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'HIGH',
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function toMobileInspection(api: ApiAssigned): Inspection {
  return {
    id: api.id,
    client: api.clientName,
    site: api.siteName,
    equipment: api.equipmentName || api.title,
    scheduledAt: formatWhen(api.scheduledFor),
    scheduledFor: api.scheduledFor,
    priority: PRIORITY[api.priority] ?? 'MEDIUM',
    status: api.status as InspectionStatus,
    instructions: api.instructions ?? '',
    startedAt: api.startedAt ?? undefined,
    version: api.version,
  };
}

function itemType(responseType: string): ChecklistSection['items'][number]['type'] {
  switch (responseType) {
    case 'NUMBER': return 'number';
    case 'BOOLEAN': return 'boolean';
    case 'CONFORMITY': return 'conformity';
    case 'SINGLE_CHOICE': return 'choice';
    case 'DATE': return 'date';
    case 'TEXT_LONG': return 'long';
    default: return 'text';
  }
}

function toSections(sections: ApiSection[]): ChecklistSection[] {
  return sections.map((section) => ({
    id: `${section.order}-${section.title}`,
    title: section.title,
    items: section.items.map((item) => ({
      id: item.id,
      label: item.title,
      type: itemType(item.responseType),
      required: item.required,
      options: item.optionsJson ? (JSON.parse(item.optionsJson) as string[]) : undefined,
      observationRequired: item.rulesJson?.includes('"observationRequiredOnFailure":true') ?? false,
      evidenceRequired: item.rulesJson?.includes('"evidenceRequiredOnFailure":true') ?? false,
    })),
  }));
}

async function session() {
  return getSession();
}

export function usesExecutionApi(): boolean {
  return dataSource === 'api';
}

export async function fetchAssignedInspections(): Promise<Inspection[]> {
  const rows = await apiRequest<ApiAssigned[]>('/inspections/my', { session: await session() });
  return rows.map(toMobileInspection);
}

export async function fetchInspection(id: string): Promise<Inspection | null> {
  try {
    const row = await apiRequest<ApiAssigned>(`/inspections/my/${id}`, { session: await session() });
    return toMobileInspection(row);
  } catch {
    return null;
  }
}

export async function fetchChecklist(id: string): Promise<ChecklistSection[]> {
  const sections = await apiRequest<ApiSection[]>(`/inspections/my/${id}/checklist`, { session: await session() });
  return toSections(sections);
}

export async function confirmInspectionEquipment(id: string, qrCode: string): Promise<Inspection> {
  const row = await apiRequest<ApiAssigned>(`/inspections/my/${id}/confirm-equipment`, {
    method: 'POST',
    session: await session(),
    body: { qrCode },
  });
  return toMobileInspection(row);
}

export async function startAssignedInspection(id: string, startedAtDevice: string): Promise<Inspection> {
  const row = await apiRequest<ApiAssigned>(`/inspections/my/${id}/start`, {
    method: 'POST',
    session: await session(),
    body: { startedAtDevice },
  });
  return toMobileInspection(row);
}

export async function uploadItemEvidence(inspectionId: string, itemId: string, uri: string): Promise<void> {
  const name = uri.split('/').pop() || 'evidencia.jpg';
  await apiUpload(`/inspections/my/${inspectionId}/items/${itemId}/evidence`, {
    uri,
    name,
    type: name.endsWith('.png') ? 'image/png' : 'image/jpeg',
  }, await session());
}

export async function saveItemObservation(id: string, itemId: string, observation: string): Promise<void> {
  await apiRequest(`/inspections/my/${id}/items/${itemId}/observation`, {
    method: 'PUT',
    session: await session(),
    body: { observation },
  });
}

export async function completeAssignedInspection(id: string, version: number, answers: { itemId: string; valueText?: string; conformity?: string; observation?: string }[]): Promise<void> {
  await apiRequest(`/inspections/my/${id}/complete`, {
    method: 'POST',
    session: await session(),
    body: { version, completedAtDevice: new Date().toISOString(), answers },
  });
}
