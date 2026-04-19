import * as SQLite from 'expo-sqlite';
import type { Database, PlatformStorage } from './storage';

export type { Database, PlatformStorage } from './storage';

const DB_NAME = 'detangle-secrets';
const STORE_NAME = 'secrets';

function openSecretsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function wrap(db: SQLite.SQLiteDatabase): Database {
  return {
    async exec(sql) {
      await db.execAsync(sql);
    },
    async run(sql, params = []) {
      const result = await db.runAsync(sql, params as SQLite.SQLiteBindValue[]);
      return {
        changes: result.changes,
        lastInsertRowid:
          typeof result.lastInsertRowId === 'number' ? result.lastInsertRowId : null,
      };
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return db.getAllAsync<T>(sql, params as SQLite.SQLiteBindValue[]);
    },
    async get<T>(sql: string, params: unknown[] = []) {
      const row = await db.getFirstAsync<T>(sql, params as SQLite.SQLiteBindValue[]);
      return row ?? null;
    },
    async close() {
      await db.closeAsync();
    },
  };
}

export const storage: PlatformStorage = {
  async getSecret(key) {
    const db = await openSecretsDb();
    const value = await tx(db, 'readonly', (s) => s.get(key));
    db.close();
    return typeof value === 'string' ? value : null;
  },
  async setSecret(key, value) {
    const db = await openSecretsDb();
    await tx(db, 'readwrite', (s) => s.put(value, key));
    db.close();
  },
  async deleteSecret(key) {
    const db = await openSecretsDb();
    await tx(db, 'readwrite', (s) => s.delete(key));
    db.close();
  },
  async openDatabase(name) {
    // When expo-sqlite's web worker fails to acquire OPFS access handles
    // (e.g. a prior crashed load left them locked), retrying inside the
    // same worker keeps failing with "Invalid VFS state" — the VFS is a
    // module-level singleton in the worker and can't be reset from
    // outside. The only way back to a good state is a fresh worker,
    // which means reloading the page. A sessionStorage flag prevents an
    // infinite reload loop if the wipe doesn't actually help.
    const RESET_FLAG = 'detangle-opfs-reset';
    try {
      const db = await SQLite.openDatabaseAsync(name);
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(RESET_FLAG);
      return wrap(db);
    } catch (err) {
      const alreadyReset =
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(RESET_FLAG) === '1';
      if (alreadyReset) {
        sessionStorage.removeItem(RESET_FLAG);
        throw err;
      }
      console.warn('[detangle] DB open failed; wiping OPFS and reloading:', err);
      try {
        const opfs = await navigator.storage.getDirectory();
        // @ts-expect-error values() is supported on FileSystemDirectoryHandle but not in lib.dom yet
        for await (const entry of opfs.values()) {
          try {
            await opfs.removeEntry((entry as FileSystemHandle).name, {
              recursive: true,
            });
          } catch {
            // best effort
          }
        }
      } catch {
        // best effort
      }
      sessionStorage.setItem(RESET_FLAG, '1');
      window.location.reload();
      // Stall so the caller never proceeds before reload happens
      await new Promise(() => {});
      throw err;
    }
  },
};
