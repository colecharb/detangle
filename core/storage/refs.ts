import type { Database } from '@platform/storage';

export interface Ref {
  repoId: number;
  name: string;
  type: 'branch' | 'tag';
  sha: string;
}

export async function upsertRefs(_db: Database, _refs: Ref[]): Promise<void> {
  throw new Error('not implemented');
}

export async function listRefs(_db: Database, _repoId: number): Promise<Ref[]> {
  throw new Error('not implemented');
}
