export type SyncQueueStatus = 'PENDING' | 'SYNCING' | 'FAILED' | 'CONFLICT';

export function canRetry(status: SyncQueueStatus): boolean {
  return status === 'FAILED';
}

export function nextRetryStatus(status: SyncQueueStatus): SyncQueueStatus {
  return canRetry(status) ? 'PENDING' : status;
}
