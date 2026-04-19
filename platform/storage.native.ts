import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import type { Database, PlatformStorage } from './storage';

export type { Database, PlatformStorage } from './storage';

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
    return SecureStore.getItemAsync(key);
  },
  async setSecret(key, value) {
    await SecureStore.setItemAsync(key, value);
  },
  async deleteSecret(key) {
    await SecureStore.deleteItemAsync(key);
  },
  async openDatabase(name) {
    const db = await SQLite.openDatabaseAsync(name);
    return wrap(db);
  },
};
