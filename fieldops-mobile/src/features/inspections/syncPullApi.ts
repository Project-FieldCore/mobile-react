import { apiRequest } from '@/infrastructure/api/client';
import { getSession } from '@/infrastructure/storage/session';

export type MobileSyncEntityType = 'INSPECTION' | 'INSPECTION_RESPONSE';
export type MobileSyncChangeOperation = 'UPSERT' | 'DELETE';

export type MobileSyncInspectionItem = {
  id: string;
  sectionTitle: string;
  sectionDescription?: string | null;
  sectionOrder: number;
  itemCode?: string | null;
  itemTitle: string;
  itemDescription?: string | null;
  responseType: string;
  required: boolean;
  rulesJson?: string | null;
  optionsJson?: string | null;
  itemOrder: number;
};

/** Formal review snapshot on INSPECTION UPSERT (api-java#201 / PBI-0062). */
export type MobileSyncInspectionReview = {
  decision: 'APPROVED' | 'REJECTED';
  motivo: string | null;
  reviewerId: string;
  reviewerName?: string | null;
  reviewedAt: string;
};

export type MobileSyncInspectionPayload = {
  id: string;
  clientId: string;
  siteId: string;
  equipmentId?: string | null;
  templateVersionId: string;
  technicianId: string;
  supervisorId?: string | null;
  title: string;
  instructions?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
  scheduledFor?: string | null;
  startedAtDevice?: string | null;
  startedAtServer?: string | null;
  version: number;
  updatedAt: string;
  items: MobileSyncInspectionItem[];
  review?: MobileSyncInspectionReview | null;
};

export type MobileSyncResponsePayload = {
  id: string;
  inspectionId: string;
  inspectionItemId: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueDate?: string | null;
  valueJson?: string | null;
  observation?: string | null;
  conformity?: string | null;
  version: number;
  updatedAt: string;
};

export type MobileSyncChange = {
  entityType: MobileSyncEntityType;
  entityId: string;
  operation: MobileSyncChangeOperation;
  updatedAt: string;
  payload?: MobileSyncInspectionPayload | MobileSyncResponsePayload | null;
};

export type MobileSyncPullResponse = {
  changes: MobileSyncChange[];
  nextCursor: string;
  serverTime: string;
  hasMore: boolean;
};

/** Base URL já inclui `/api/v1`. */
export const MOBILE_SYNC_PULL_PATH = '/mobile/sync/pull';

export async function pullMobileSyncChanges(cursor: string | null): Promise<MobileSyncPullResponse> {
  const session = await getSession();
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiRequest<MobileSyncPullResponse>(`${MOBILE_SYNC_PULL_PATH}${query}`, {
    method: 'GET',
    session,
  });
}
