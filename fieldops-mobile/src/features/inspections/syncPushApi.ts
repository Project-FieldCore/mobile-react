import { apiRequest } from '@/infrastructure/api/client';
import { getSession } from '@/infrastructure/storage/session';
import { getOrCreateDeviceId } from '@/infrastructure/storage/deviceId';

export type MobileSyncStatus =
  | 'APPLIED'
  | 'ALREADY_APPLIED'
  | 'REJECTED'
  | 'CONFLICT'
  | 'DEPENDENCY_FAILED';

export type InspectionResponsePayload = {
  inspectionItemId: string;
  valueText?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueDate?: string;
  conformity?: 'NOT_APPLICABLE' | 'CONFORMING' | 'NON_CONFORMING';
  observation?: string;
};

export type MobileSyncOperation = {
  operationId: string;
  entityType: string;
  entityId: string;
  operationType: string;
  dependencyIds?: string[];
  baseVersion?: number | null;
  payload?: InspectionResponsePayload;
};

export type MobileSyncServerResponse = {
  id?: string | null;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueDate?: string | null;
  conformity?: string | null;
  observation?: string | null;
};

export type MobileSyncOperationResult = {
  operationId: string;
  status: MobileSyncStatus;
  entityVersion?: number | null;
  server?: MobileSyncServerResponse | null;
};

export type MobileSyncPushResponse = {
  results: MobileSyncOperationResult[];
  serverTime: string;
};

/** Base URL já inclui `/api/v1` (ver EXPO_PUBLIC_API_URL). */
export const MOBILE_SYNC_PUSH_PATH = '/mobile/sync/push';

export async function pushMobileSyncOperations(
  operations: MobileSyncOperation[],
  lastPullCursor: string | null = null,
): Promise<MobileSyncPushResponse> {
  const [session, deviceId] = await Promise.all([getSession(), getOrCreateDeviceId()]);
  return apiRequest<MobileSyncPushResponse>(MOBILE_SYNC_PUSH_PATH, {
    method: 'POST',
    session,
    body: {
      deviceId,
      lastPullCursor,
      operations,
    },
  });
}
