# Architecture

## Concept

A GitHub repo graph viewer with **semantic zoom**: zoomed out shows week-scale activity blocks, mid-zoom shows PR-sized clusters with titles, zoomed in shows individual commits. Three view modes: swim lane, author lanes, heatmap calendar. Filter-first UX designed for small screens.

One codebase, three targets: web, iOS, Android. Zero backend.

## Stack

| Concern | Choice |
|---|---|
| Framework | Expo SDK 55, Expo Router |
| Language | TypeScript (strict) |
| Rendering (graph canvas) | `@shopify/react-native-skia` |
| Rendering (everything else) | React Native components (web via RN Web) |
| Gestures | `react-native-gesture-handler` + `react-native-reanimated` |
| Styling | NativeWind (Tailwind for RN) |
| Auth | GitHub OAuth device flow |
| Secret storage | `expo-secure-store` (native) / IndexedDB (web) |
| Commit cache | `expo-sqlite` (WASM build on web) |
| Hosting | EAS Hosting or Vercel static (web), EAS Build (native) |

Rationale for every choice lives in `DECISIONS.md`.

## Folder layout

```
/app                  # Expo Router routes (shared across web + native)
  _layout.tsx
  index.tsx             # landing / sign-in
  repos.tsx             # repo picker
  [owner]/[repo].tsx    # graph view
/core                 # pure TS — no RN/DOM/Expo imports
  /graph                # layout algorithms (swim lane, author, tiers)
  /github               # API client, device flow auth, sync logic
  /storage              # schema, migrations, typed DB access
/components           # RN components (work on web via RN Web)
  GraphCanvas.tsx       # Skia surface
  /views                # SwimLane, AuthorLanes, HeatmapCalendar
/platform             # platform-specific adapters
  storage.native.ts     # expo-secure-store + expo-sqlite
  storage.web.ts        # IndexedDB + expo-sqlite (WASM)
/docs                 # this directory
```

## Invariants

### The `/core` purity rule

`/core` must be importable and runnable in a plain Node environment with nothing but standard APIs (`fetch`) and the `@platform/*` adapter interface. This means:

- No `import from 'react'`, `'react-native'`, `'expo-*'`, `'@shopify/react-native-skia'`.
- No DOM globals (`window`, `document`, `localStorage`).
- No Node-only globals either (`process.env` only via a constants module that's injected).
- Side effects (storage, network) go through injected adapters. `/core` takes an adapter interface, doesn't reach out for it.

This rule exists so:
1. The layout math and sync logic is testable without a device or browser.
2. The rendering layer is swappable (Skia today, could be something else later).
3. Platform divergence is contained to `/platform`, which stays small.

### The platform adapter pattern

`/platform/storage.native.ts` and `/platform/storage.web.ts` both export the same interface. Metro resolves `.native.ts` for iOS/Android and `.web.ts` for web automatically. Consumers import from `@platform/storage` and get the right one.

Interface (see `CORE_API.md` for details):

```ts
export interface PlatformStorage {
  // Secret storage (tokens)
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;

  // Database
  openDatabase(name: string): Promise<Database>;
}
```

If `/core` needs a new platform capability, the process is:
1. Add to the interface here.
2. Implement in both adapters.
3. Use in `/core`.

Never reach for platform APIs directly from `/core`.

### The no-backend rule

Everything runs on the user's device:
- GitHub token lives in SecureStore / IndexedDB, never transmitted except to GitHub itself.
- Commit cache in local SQLite, never synced anywhere.
- No user accounts. No email collection. No analytics services that receive PII.
- Static hosting only for the web build.

If a feature seems to need a backend, it doesn't belong in v1.

## Data model (local SQLite)

```sql
CREATE TABLE IF NOT EXISTS repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  last_synced_at INTEGER,
  UNIQUE(owner, name)
);

CREATE TABLE IF NOT EXISTS commits (
  sha TEXT PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  parents TEXT NOT NULL,        -- JSON array of parent SHAs
  author_name TEXT,
  author_email TEXT,
  committed_at INTEGER NOT NULL,  -- unix seconds
  message TEXT NOT NULL,
  pr_number INTEGER
);

CREATE INDEX IF NOT EXISTS idx_commits_repo ON commits(repo_id);
CREATE INDEX IF NOT EXISTS idx_commits_repo_date ON commits(repo_id, committed_at DESC);

CREATE TABLE IF NOT EXISTS refs (
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'branch' | 'tag'
  sha TEXT NOT NULL,
  PRIMARY KEY (repo_id, name)
);
```

Token storage is separate (SecureStore / IndexedDB), keyed by `github_token`.

## Sync strategy

**First open of a repo:**
1. `GET /repos/{owner}/{repo}/git/refs` → all branches and tags.
2. For each ref tip, paginate `GET /repos/{owner}/{repo}/commits?sha=<tip>`, walking backwards.
3. Stop paginating a branch when you hit a SHA already in the local DB (from a previously-walked branch).
4. Upsert commits, update `refs` table, set `last_synced_at`.

**Subsequent opens:**
1. Fetch refs, compare tip SHAs to stored.
2. For any ref whose tip changed, walk backwards until hitting a known SHA.
3. Usually a handful of requests.

**Rate limits:** GitHub allows 5000 req/hour per user token. Every user brings their own. No shared quota to worry about.

## Semantic zoom tiers

Three layout functions in `/core/graph`, tier selected by zoom level + viewport:

- **Tier 0 (far)** — week buckets. Each bucket is a rectangle, size/color = commit count. No individual commits visible.
- **Tier 1 (mid)** — PR/cluster layout. Commits grouped by PR number (if available) or by contiguous same-author runs on a branch. Each cluster shows title + commit count.
- **Tier 2 (near)** — individual commits with SHAs, messages, avatars, parent edges.

Transitions: Reanimated shared value drives zoom; tier selection crosses thresholds; opacity crossfade while positions interpolate.

## Views (v1 ships all three)

- **Swim lane** — classic branch-ordered lanes. x-axis toggleable: topological order or real time.
- **Author lanes** — y = author, x = time; merges arc between authors.
- **Heatmap calendar** — GitHub-contribution-style grid; tap a cell to drill into that day in the currently active view.

## New-user flow

1. Open app (web URL or native launcher).
2. Tap "Connect GitHub" → device flow starts, app shows a 6-char code and opens `github.com/login/device`.
3. User enters code, approves scopes (`repo` for private, `public_repo` for public-only).
4. App polls, receives token, stores in SecureStore/IndexedDB.
5. Repo picker loads their repos via `GET /user/repos`.
6. Tap a repo → sync runs → graph renders.

No accounts. No email. No passwords. Nothing server-side knows the user exists.
