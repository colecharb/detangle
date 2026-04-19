import type { Database } from '@platform/storage';

export interface Repo {
  id: number;
  owner: string;
  name: string;
  lastSyncedAt: number | null;
}

export async function upsertRepo(
  _db: Database,
  _owner: string,
  _name: string,
): Promise<Repo> {
  throw new Error('not implemented');
}

export async function getRepo(
  _db: Database,
  _owner: string,
  _name: string,
): Promise<Repo | null> {
  throw new Error('not implemented');
}

export async function listRepos(_db: Database): Promise<Repo[]> {
  throw new Error('not implemented');
}

export async function setLastSynced(
  _db: Database,
  _repoId: number,
  _at: number,
): Promise<void> {
  throw new Error('not implemented');
}
