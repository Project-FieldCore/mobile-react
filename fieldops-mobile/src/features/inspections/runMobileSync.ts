import { setLastSyncAt } from './syncCursorStore';
import { runOutboxSync } from './runOutboxSync';
import { runSyncPull, type SyncPullResult } from './runSyncPull';
import type { BatchSyncResult } from './batchSync';

export type MobileSyncRunResult = {
  push: BatchSyncResult;
  pull: SyncPullResult;
};

/**
 * Ordem: push → pull.
 * Respostas locais sobem antes de baixar mudanças do servidor.
 * `lastPullCursor` no body do push continua ignorado pelo servidor.
 */
export async function runMobileSync(): Promise<MobileSyncRunResult> {
  const push = await runOutboxSync();
  const pull = await runSyncPull();
  await setLastSyncAt(new Date().toISOString());
  return { push, pull };
}
