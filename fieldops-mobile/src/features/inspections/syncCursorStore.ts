import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

const webCursorKey = 'fieldops.last-pull-cursor';
const webServerTimeKey = 'fieldops.last-pull-server-time';
const webSyncedAtKey = 'fieldops.last-sync-at';

const CURSOR_KEY = 'last_pull_cursor';
const SERVER_TIME_KEY = 'last_pull_server_time';
const SYNCED_AT_KEY = 'last_sync_at';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('fieldops.db').then(async (database) => {
      await database.execAsync(
        'CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
      );
      return database;
    });
  }
  return databasePromise;
}

async function readMeta(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return null;
    const storageKey = key === CURSOR_KEY ? webCursorKey : key === SERVER_TIME_KEY ? webServerTimeKey : webSyncedAtKey;
    return localStorage.getItem(storageKey);
  }
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', key);
  return row?.value ?? null;
}

async function writeMeta(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return;
    const storageKey = key === CURSOR_KEY ? webCursorKey : key === SERVER_TIME_KEY ? webServerTimeKey : webSyncedAtKey;
    localStorage.setItem(storageKey, value);
    return;
  }
  const database = await getDatabase();
  await database.runAsync(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
    key,
    value,
  );
}

/** Cursor opaco — não interpretar o conteúdo. */
export async function getLastPullCursor(): Promise<string | null> {
  const value = await readMeta(CURSOR_KEY);
  return value && value.length > 0 ? value : null;
}

export async function setLastPullCursor(cursor: string): Promise<void> {
  await writeMeta(CURSOR_KEY, cursor);
}

export async function getLastPullServerTime(): Promise<string | null> {
  return readMeta(SERVER_TIME_KEY);
}

export async function setLastPullServerTime(serverTime: string): Promise<void> {
  await writeMeta(SERVER_TIME_KEY, serverTime);
}

export async function getLastSyncAt(): Promise<string | null> {
  return readMeta(SYNCED_AT_KEY);
}

export async function setLastSyncAt(iso: string): Promise<void> {
  await writeMeta(SYNCED_AT_KEY, iso);
}
