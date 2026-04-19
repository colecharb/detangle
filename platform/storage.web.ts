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
    try {
      const db = await SQLite.openDatabaseAsync(name);
      return wrap(db);
    } catch (err) {
      // expo-sqlite on web requires OPFS access handles. Some browsers
      // (Firefox in particular) can leave those handles in a stuck state
      // that survives page reloads and can't be cleared from JS. When
      // that happens, fall back to an in-memory DB so the app still
      // works for the current session. Data is lost on reload but the
      // token stays in IndexedDB (separate path), so re-sync is the only
      // cost.
      console.warn(
        '[detangle] OPFS-backed SQLite failed; using an in-memory DB. ' +
          'Data will not persist across page reloads.',
        err,
      );
      const db = await SQLite.openDatabaseAsync(':memory:');
      return wrap(db);
    }
  },
};
