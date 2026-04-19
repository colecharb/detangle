export interface Database {
  exec(sql: string): Promise<void>;
  run(
    sql: string,
    params?: unknown[],
  ): Promise<{ changes: number; lastInsertRowid: number | null }>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | null>;
  close(): Promise<void>;
}

export interface PlatformStorage {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  openDatabase(name: string): Promise<Database>;
}

// The runtime value is provided by storage.native.ts / storage.web.ts via
// Metro's platform-specific resolution. This declaration exists so
// consumers importing from '@platform/storage' get the typed surface.
export declare const storage: PlatformStorage;
