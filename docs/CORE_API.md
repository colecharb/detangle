# Core API

The interface contract for `/core` and `/platform`. When code changes, this doc changes in the same commit.

---

## `/platform/storage`

Both `storage.native.ts` and `storage.web.ts` export the same `PlatformStorage` object. Metro resolves the right one per platform.

```ts
export interface PlatformStorage {
  // Secret storage — for tokens only. Encrypted at rest where platform supports it.
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;

  // Database — opens (and creates if missing) a SQLite DB by name.
  openDatabase(name: string): Promise<Database>;
}

export interface Database {
  exec(sql: string): Promise<void>;                              // for schema
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number | null }>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | null>;
  close(): Promise<void>;
}
```

**Native implementation:** `expo-secure-store` for secrets, `expo-sqlite` for database.
**Web implementation:** IndexedDB (via a tiny wrapper) for secrets, `expo-sqlite` WASM build for database.

---

## `/core/storage`

Schema, migrations, and typed accessors. Takes a `Database` from the platform adapter.

```ts
// /core/storage/schema.ts
export async function migrate(db: Database): Promise<void>;

// /core/storage/repos.ts
export interface Repo {
  id: number;
  owner: string;
  name: string;
  lastSyncedAt: number | null;  // unix seconds
}

export async function upsertRepo(db: Database, owner: string, name: string): Promise<Repo>;
export async function getRepo(db: Database, owner: string, name: string): Promise<Repo | null>;
export async function listRepos(db: Database): Promise<Repo[]>;
export async function setLastSynced(db: Database, repoId: number, at: number): Promise<void>;

// /core/storage/commits.ts
export interface Commit {
  sha: string;
  repoId: number;
  parents: string[];
  authorName: string | null;
  authorEmail: string | null;
  committedAt: number;  // unix seconds
  message: string;
  prNumber: number | null;
}

export async function upsertCommits(db: Database, commits: Commit[]): Promise<void>;
export async function getCommit(db: Database, sha: string): Promise<Commit | null>;
export async function listCommits(db: Database, repoId: number, filter?: CommitFilter): Promise<Commit[]>;
export async function hasCommit(db: Database, sha: string): Promise<boolean>;

export interface CommitFilter {
  dateFrom?: number;
  dateTo?: number;
  authors?: string[];
  branches?: string[];
  shas?: string[];      // explicit set, used for file-path filtering
}

// /core/storage/refs.ts
export interface Ref {
  repoId: number;
  name: string;
  type: 'branch' | 'tag';
  sha: string;
}

export async function upsertRefs(db: Database, refs: Ref[]): Promise<void>;
export async function listRefs(db: Database, repoId: number): Promise<Ref[]>;

// /core/storage/pulls.ts
export interface Pull {
  repoId: number;
  number: number;
  title: string;
  mergeCommitSha: string | null;
}

export async function upsertPulls(
  db: Database,
  repoId: number,
  pulls: { number: number; title: string; mergeCommitSha: string | null }[],
): Promise<void>;

export async function listPulls(db: Database, repoId: number): Promise<Pull[]>;
```

---

## `/core/github`

GitHub API client and sync logic. Pure functions that take the token as argument, never read from storage directly.

```ts
// /core/github/auth.ts
export interface DeviceFlowStart {
  userCode: string;         // shown to the user
  verificationUri: string;  // they open this
  deviceCode: string;       // we poll with this
  intervalSeconds: number;
  expiresAt: number;        // unix seconds
}

export async function startDeviceFlow(clientId: string): Promise<DeviceFlowStart>;
export async function pollForToken(clientId: string, start: DeviceFlowStart, signal?: AbortSignal): Promise<string>;

// /core/github/client.ts
export interface GitHubClient {
  listRepos(): Promise<RepoSummary[]>;
  listRefs(owner: string, name: string): Promise<RefSummary[]>;
  listCommits(owner: string, name: string, sha: string, cursor?: string): Promise<{ commits: CommitSummary[]; nextCursor: string | null }>;
  listPulls(owner: string, name: string): Promise<PullSummary[]>;
  listCommitsForPath(owner: string, name: string, path: string): Promise<CommitSummary[]>;
}

export function createClient(token: string): GitHubClient;

export interface RepoSummary { owner: string; name: string; isPrivate: boolean; defaultBranch: string; }
export interface RefSummary { name: string; type: 'branch' | 'tag'; sha: string; }
export interface CommitSummary {
  sha: string;
  parents: string[];
  authorName: string | null;
  authorEmail: string | null;
  committedAt: number;
  message: string;
}
export interface PullSummary { number: number; mergeCommitSha: string | null; title: string; }

// /core/github/sync.ts
export interface SyncResult {
  commitsAdded: number;
  refsUpdated: number;
  durationMs: number;
}

export async function syncRepo(
  client: GitHubClient,
  db: Database,
  owner: string,
  name: string,
  onProgress?: (stage: string, count: number) => void,
): Promise<SyncResult>;

export async function enrichWithPullRequests(
  client: GitHubClient,
  db: Database,
  owner: string,
  name: string,
): Promise<{ commitsUpdated: number }>;
```

---

## `/core/graph`

Pure layout algorithms. Input: commits + filters. Output: positioned nodes/edges for rendering.

```ts
// /core/graph/types.ts
export type ViewMode = 'swimlane' | 'authorLanes' | 'heatmap';
export type Tier = 0 | 1 | 2;

export interface CommitNode {
  sha: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  label?: string;
  // Metadata passed through for tooltips / detail sheets
  meta: { authorName: string | null; committedAt: number; message: string };
}

export interface ClusterNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  count: number;
  color: string;
}

export interface BucketNode {
  id: string;           // e.g. '2026-W03'
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
  color: string;
}

export interface Edge {
  from: { x: number; y: number };
  to: { x: number; y: number };
  kind: 'parent' | 'merge' | 'author-arc';
}

export interface GraphLayout {
  tier: Tier;
  viewMode: ViewMode;
  nodes: CommitNode[] | ClusterNode[] | BucketNode[];
  edges: Edge[];
  bounds: { width: number; height: number };
}

// /core/graph/tierSelection.ts
export interface TierSelectionContext {
  totalCommits: number;
  spanSeconds?: number;   // maxCommittedAt - minCommittedAt; clamps behavior on narrow-history repos
}

export function selectTier(
  zoomLevel: number,
  viewportWidth: number,
  totalCommits: number,
  currentTier?: Tier,       // enables hysteresis when provided
  context?: TierSelectionContext,
): Tier;

export const TIER_THRESHOLDS: {
  tier1to2: number;
  tier0to1: number;
  hysteresis: number;
  phoneBias: number;
  phoneViewportCutoff: number;
};

// /core/graph/layout.ts — top-level dispatcher
export function layoutGraph(
  commits: Commit[],
  refs: Ref[],
  viewMode: ViewMode,
  tier: Tier,
): GraphLayout;

// Individual layout functions (used by the dispatcher, exported for testability)
export function tier0LayoutSwimLane(commits: Commit[]): GraphLayout;
export function tier1LayoutSwimLane(commits: Commit[], refs: Ref[]): GraphLayout;
export function tier2LayoutSwimLane(commits: Commit[], refs: Ref[]): GraphLayout;

export function tier0LayoutAuthorLanes(commits: Commit[]): GraphLayout;
export function tier1LayoutAuthorLanes(commits: Commit[]): GraphLayout;
export function tier2LayoutAuthorLanes(commits: Commit[]): GraphLayout;

// /core/graph/filters.ts
export interface GraphFilter {
  dateFrom?: number;
  dateTo?: number;
  authors?: string[];
  branches?: string[];
  paths?: string[];
}

export function filterToCommitFilter(filter: GraphFilter, pathSha: Set<string> | null): CommitFilter;
export function encodeFilterToUrl(filter: GraphFilter): string;
export function decodeFilterFromUrl(params: URLSearchParams): GraphFilter;
```

---

## Dependency rules

- `/core/storage` depends on `Database` from `@platform/storage`.
- `/core/github` depends on nothing platform-specific; takes token as argument.
- `/core/graph` depends on types from `/core/storage` and nothing else. No network, no storage.
- `/components` depends on `/core` and `@platform/*` adapters.
- `/app` depends on `/components` and `/core`.
- No circular imports.
- Nothing in `/core` imports from `/components` or `/app`. Ever.
