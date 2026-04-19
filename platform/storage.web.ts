import initSqlJs, { type Database as SqlJsDb, type SqlJsStatic } from 'sql.js';
import type { Database, PlatformStorage } from './storage';

export type { Database, PlatformStorage } from './storage';

const SECRETS_DB = 'detangle-secrets';
const SECRETS_STORE = 'secrets';

function openSecretsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SECRETS_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SECRETS_STORE);
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
    const transaction = db.transaction(SECRETS_STORE, mode);
    const store = transaction.objectStore(SECRETS_STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;
function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: (file: string) => `/${file}`,
    });
  }
  return sqlJsPromise;
}

function wrap(db: SqlJsDb): Database {
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params = []) {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params as never[]);
        stmt.step();
      } finally {
        stmt.free();
      }
      const changes = db.getRowsModified();
      const result = db.exec('SELECT last_insert_rowid() AS id');
      const raw = result[0]?.values?.[0]?.[0];
      const lastInsertRowid = typeof raw === 'number' && raw > 0 ? raw : null;
      return { changes, lastInsertRowid };
    },
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params as never[]);
        const rows: T[] = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as T);
        }
        return rows;
      } finally {
        stmt.free();
      }
    },
    async get<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params as never[]);
        return stmt.step() ? (stmt.getAsObject() as T) : null;
      } finally {
        stmt.free();
      }
    },
    async close() {
      db.close();
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
  async openDatabase(_name) {
    const SQL = await loadSqlJs();
    const db = new SQL.Database();
    return wrap(db);
  },
};
