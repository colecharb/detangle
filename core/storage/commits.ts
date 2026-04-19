import type { Database } from '@platform/storage';

export interface Commit {
  sha: string;
  repoId: number;
  parents: string[];
  authorName: string | null;
  authorEmail: string | null;
  committedAt: number;
  message: string;
  prNumber: number | null;
}

export interface CommitFilter {
  dateFrom?: number;
  dateTo?: number;
  authors?: string[];
  branches?: string[];
  shas?: string[];
}

export async function upsertCommits(
  _db: Database,
  _commits: Commit[],
): Promise<void> {
  throw new Error('not implemented');
}

export async function getCommit(
  _db: Database,
  _sha: string,
): Promise<Commit | null> {
  throw new Error('not implemented');
}

export async function listCommits(
  _db: Database,
  _repoId: number,
  _filter?: CommitFilter,
): Promise<Commit[]> {
  throw new Error('not implemented');
}

export async function hasCommit(_db: Database, _sha: string): Promise<boolean> {
  throw new Error('not implemented');
}
