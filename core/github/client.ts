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

const API_BASE = 'https://api.github.com';

export class GitHubAuthError extends Error {
  constructor() {
    super('GitHub token is invalid or expired');
    this.name = 'GitHubAuthError';
  }
}

export class GitHubRateLimitError extends Error {
  constructor(public resetAt: number) {
    super(`GitHub rate limit exceeded; resets at ${new Date(resetAt * 1000).toISOString()}`);
    this.name = 'GitHubRateLimitError';
  }
}

export function createClient(getToken: () => Promise<string>): GitHubClient {
  async function request(path: string): Promise<{ body: unknown; linkHeader: string | null }> {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const token = await getToken();
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (res.status === 401) throw new GitHubAuthError();
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0);
        throw new GitHubRateLimitError(reset);
      }
    }
    if (!res.ok) {
      throw new Error(`GitHub ${res.status} ${res.statusText} on ${path}`);
    }
    return { body: await res.json(), linkHeader: res.headers.get('link') };
  }

  function parseNext(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return match?.[1] ?? null;
  }

  async function requestPaged<T>(path: string): Promise<T[]> {
    const all: T[] = [];
    let next: string | null = path;
    while (next) {
      const { body, linkHeader }: { body: unknown; linkHeader: string | null } =
        await request(next);
      all.push(...(body as T[]));
      next = parseNext(linkHeader);
    }
    return all;
  }

  async function requestPagedNested<T>(path: string, key: string): Promise<T[]> {
    const all: T[] = [];
    let next: string | null = path;
    while (next) {
      const { body, linkHeader }: { body: unknown; linkHeader: string | null } =
        await request(next);
      const items = (body as Record<string, unknown>)[key] as T[] | undefined;
      if (items) all.push(...items);
      next = parseNext(linkHeader);
    }
    return all;
  }

  return {
    async listRepos() {
      type RawInstallation = { id: number };
      type RawRepo = {
        owner: { login: string };
        name: string;
        private: boolean;
        default_branch: string;
      };
      const installations = await requestPagedNested<RawInstallation>(
        '/user/installations?per_page=100',
        'installations',
      );
      const byKey = new Map<string, RepoSummary>();
      for (const inst of installations) {
        const repos = await requestPagedNested<RawRepo>(
          `/user/installations/${inst.id}/repositories?per_page=100`,
          'repositories',
        );
        for (const r of repos) {
          byKey.set(`${r.owner.login}/${r.name}`, {
            owner: r.owner.login,
            name: r.name,
            isPrivate: r.private,
            defaultBranch: r.default_branch,
          });
        }
      }
      return Array.from(byKey.values()).sort((a, b) =>
        `${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`),
      );
    },

    async listRefs(owner, name) {
      type RawRef = { ref: string; object: { sha: string } };
      const [heads, tags] = await Promise.all([
        requestPaged<RawRef>(
          `/repos/${owner}/${name}/git/matching-refs/heads?per_page=100`,
        ).catch((err) => {
          if (err instanceof Error && err.message.includes('404')) return [];
          throw err;
        }),
        requestPaged<RawRef>(
          `/repos/${owner}/${name}/git/matching-refs/tags?per_page=100`,
        ).catch((err) => {
          if (err instanceof Error && err.message.includes('404')) return [];
          throw err;
        }),
      ]);
      const branches: RefSummary[] = heads.map((r) => ({
        name: r.ref.replace(/^refs\/heads\//, ''),
        type: 'branch',
        sha: r.object.sha,
      }));
      const tagRefs: RefSummary[] = tags.map((r) => ({
        name: r.ref.replace(/^refs\/tags\//, ''),
        type: 'tag',
        sha: r.object.sha,
      }));
      return [...branches, ...tagRefs];
    },

    async listCommits(owner, name, sha, cursor) {
      type RawCommit = {
        sha: string;
        parents: { sha: string }[];
        commit: {
          author: { name?: string; email?: string; date: string } | null;
          committer: { date: string } | null;
          message: string;
        };
      };
      const url =
        cursor ??
        `/repos/${owner}/${name}/commits?sha=${encodeURIComponent(sha)}&per_page=100`;
      const { body, linkHeader } = await request(url);
      const raw = body as RawCommit[];
      const commits: CommitSummary[] = raw.map((c) => ({
        sha: c.sha,
        parents: c.parents.map((p) => p.sha),
        authorName: c.commit.author?.name ?? null,
        authorEmail: c.commit.author?.email ?? null,
        committedAt: Math.floor(
          new Date(c.commit.committer?.date ?? c.commit.author?.date ?? 0).getTime() /
            1000,
        ),
        message: c.commit.message,
      }));
      return { commits, nextCursor: parseNext(linkHeader) };
    },

    async listPulls(owner, name) {
      type RawPull = { number: number; merge_commit_sha: string | null; title: string };
      const raw = await requestPaged<RawPull>(
        `/repos/${owner}/${name}/pulls?state=all&per_page=100`,
      );
      return raw.map((p) => ({
        number: p.number,
        mergeCommitSha: p.merge_commit_sha,
        title: p.title,
      }));
    },

    async listCommitsForPath(owner, name, path) {
      type RawCommit = {
        sha: string;
        parents: { sha: string }[];
        commit: {
          author: { name?: string; email?: string; date: string } | null;
          committer: { date: string } | null;
          message: string;
        };
      };
      const raw = await requestPaged<RawCommit>(
        `/repos/${owner}/${name}/commits?path=${encodeURIComponent(path)}&per_page=100`,
      );
      return raw.map((c) => ({
        sha: c.sha,
        parents: c.parents.map((p) => p.sha),
        authorName: c.commit.author?.name ?? null,
        authorEmail: c.commit.author?.email ?? null,
        committedAt: Math.floor(
          new Date(c.commit.committer?.date ?? c.commit.author?.date ?? 0).getTime() /
            1000,
        ),
        message: c.commit.message,
      }));
    },
  };
}
