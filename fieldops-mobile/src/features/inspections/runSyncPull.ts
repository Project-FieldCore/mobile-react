import {
  getLastPullCursor,
  setLastPullCursor,
  setLastPullServerTime,
} from './syncCursorStore';
import { applyPullChanges, type ApplyPullPageResult } from './syncPullApply';
import { pullMobileSyncChanges } from './syncPullApi';

const MAX_PULL_PAGES = 50;

export type SyncPullResult = {
  pages: number;
  changes: number;
  hasMoreStopped: boolean;
  serverTime: string | null;
  applied: ApplyPullPageResult;
};

/**
 * Baixa páginas de `/mobile/sync/pull` até `hasMore=false`.
 * Avança o cursor **somente depois** de persistir a página (AC-SYNC).
 */
export async function runSyncPull(): Promise<SyncPullResult> {
  let cursor = await getLastPullCursor();
  let pages = 0;
  let changes = 0;
  let serverTime: string | null = null;
  const applied: ApplyPullPageResult = {
    upsertedInspections: 0,
    upsertedResponses: 0,
    deletedInspections: 0,
  };

  while (pages < MAX_PULL_PAGES) {
    const page = await pullMobileSyncChanges(cursor);
    pages += 1;
    serverTime = page.serverTime;
    changes += page.changes.length;

    const pageApplied = await applyPullChanges(page.changes);
    applied.upsertedInspections += pageApplied.upsertedInspections;
    applied.upsertedResponses += pageApplied.upsertedResponses;
    applied.deletedInspections += pageApplied.deletedInspections;

    // Persistência local concluída — agora é seguro avançar o cursor.
    await setLastPullCursor(page.nextCursor);
    await setLastPullServerTime(page.serverTime);
    cursor = page.nextCursor;

    if (!page.hasMore) {
      return { pages, changes, hasMoreStopped: false, serverTime, applied };
    }
  }

  return { pages, changes, hasMoreStopped: true, serverTime, applied };
}
