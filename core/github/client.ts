export interface RepoSummary {
  owner: string;
  name: string;
  isPrivate: boolean;
  defaultBranch: string;
}

export interface RefSummary {
  name: string;
  type: 'branch' | 'tag';
  sha: string;
}

export interface CommitSummary {
  sha: string;
  parents: string[];
  authorName: string | null;
  authorEmail: string | null;
  committedAt: number;
  message: string;
}

export interface PullSummary {
  number: number;
  mergeCommitSha: string | null;
  title: string;
}

export interface GitHubClient {
  listRepos(): Promise<RepoSummary[]>;
  listRefs(owner: string, name: string): Promise<RefSummary[]>;
  listCommits(
    owner: string,
    name: string,
    sha: string,
    cursor?: string,
  ): Promise<{ commits: CommitSummary[]; nextCursor: string | null }>;
  listPulls(owner: string, name: string): Promise<PullSummary[]>;
  listCommitsForPath(
    owner: string,
    name: string,
    path: string,
  ): Promise<CommitSummary[]>;
}

export function createClient(_token: string): GitHubClient {
  throw new Error('not implemented');
}
