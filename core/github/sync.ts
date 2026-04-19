import type { Database } from '@platform/storage';
import type { GitHubClient } from './client';

export interface SyncResult {
  commitsAdded: number;
  refsUpdated: number;
  durationMs: number;
}

export async function syncRepo(
  _client: GitHubClient,
  _db: Database,
  _owner: string,
  _name: string,
  _onProgress?: (stage: string, count: number) => void,
): Promise<SyncResult> {
  throw new Error('not implemented');
}

export async function enrichWithPullRequests(
  _client: GitHubClient,
  _db: Database,
  _owner: string,
  _name: string,
): Promise<{ commitsUpdated: number }> {
  throw new Error('not implemented');
}
