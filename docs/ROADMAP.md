# Roadmap

Phases are sequential. Each has explicit acceptance criteria. Don't move on until they pass.

When a phase completes, update `PROGRESS.md`.

---

## Phase 0 — Scaffolding

**Goal:** empty but correctly-configured Expo universal app that boots on web, iOS simulator, and Android emulator.

**Tasks:**
1. Initialize with `npx create-expo-app@latest` using TypeScript + Expo Router template.
2. Enable web target in `app.json`: `"web": { "bundler": "metro", "output": "static" }`.
3. Install and configure per each library's Expo setup docs:
   - `nativewind` + `tailwindcss` (babel plugin, metro config, `global.css`)
   - `@shopify/react-native-skia`
   - `react-native-gesture-handler` (root wrapper)
   - `react-native-reanimated` (babel plugin, last in the list)
   - `expo-sqlite`
   - `expo-secure-store`
4. Folder structure: `/app`, `/core`, `/components`, `/platform`, `/docs`.
5. tsconfig path aliases: `@core/*`, `@components/*`, `@platform/*`.
6. `/core` subfolders with `index.ts` barrels: `graph`, `github`, `storage`. Each exports stubs matching `CORE_API.md`.
7. `/platform/storage.native.ts` and `/platform/storage.web.ts` — both implement the `PlatformStorage` interface from `CORE_API.md`. Stub implementations acceptable for now, but types must be complete.
8. `/core/storage/schema.ts` — SQL schema and idempotent `migrate(db)` function. Schema from `ARCHITECTURE.md`.
9. `.env.example` with `EXPO_PUBLIC_GITHUB_CLIENT_ID`.
10. Root `README.md` with project description, quick start, link to `docs/`.

**Acceptance criteria:**
- `npx expo start --web` boots to a blank landing route showing the app title.
- `npx expo start` runs on iOS simulator and Android emulator without crashing.
- `tsc --noEmit` passes.
- All files in `/core` are checked against the purity rule (no RN/DOM/Expo imports) — run `grep -r "from 'react-native" core/` and confirm zero matches.
- `docs/PROGRESS.md` updated to mark Phase 0 complete.

---

## Phase 1 — Auth & Sync

**Goal:** user can authenticate via device flow, pick a repo, and have its commits synced to local SQLite.

**Tasks:**
1. Implement `core/github/auth.ts`:
   - `startDeviceFlow()` → requests device code from GitHub, returns `{ user_code, verification_uri, device_code, interval }`.
   - `pollForToken(deviceCode, interval)` → polls until authorized or denied, returns token or throws.
2. Implement `core/github/client.ts`:
   - Authenticated fetch wrapper with rate-limit awareness.
   - `listRepos()`, `listRefs(owner, repo)`, `listCommits(owner, repo, sha, cursor?)`.
3. Implement `core/github/sync.ts`:
   - `syncRepo(owner, repo, db)` — walks refs, fetches commits, dedupes, upserts into SQLite.
   - Incremental mode: given stored ref tip SHAs, only walks changed refs back to known commits.
4. UI:
   - `/app/index.tsx` — landing screen with "Connect GitHub" button.
   - Device flow modal: shows user code, copy button, link to verification URL, polls in background, dismisses on success.
   - `/app/repos.tsx` — repo picker listing user's repos with search filter.
   - `/app/[owner]/[repo].tsx` — stub page showing "Synced N commits" after sync completes, with a "Resync" button.
5. Error handling: rate limit, network failure, denied auth, token expiration.

**Acceptance criteria:**
- Fresh install flow: tap connect → enter code on github.com → see repo list → pick repo → commits appear in DB.
- Resync on an already-synced repo only fetches commits on changed refs (verify via network inspector / log).
- Token survives app restart (native) and browser refresh (web).
- `docs/PROGRESS.md` updated.

---

## Phase 2 — Graph Canvas + Tier 2

**Goal:** Tap a repo and see a pannable, pinch-zoomable graph of individual commits.

**Tasks:**
1. Implement `core/graph/types.ts` with `CommitNode`, `CommitEdge`, `GraphLayout` types per `CORE_API.md`.
2. Implement `core/graph/topology.ts` — topological sort of commits by parent relationships.
3. Implement `core/graph/laneAssignment.ts` — assigns each commit to a lane (column) using the standard git graph algorithm (reuse lanes when possible, new lane for branches).
4. Implement `core/graph/tier2Layout.ts` — given commits + lane assignments, produces `{x, y}` for each node and bezier/straight edges.
5. Implement `components/GraphCanvas.tsx`:
   - Single Skia `<Canvas>`.
   - Pan + pinch via gesture handler + Reanimated shared values.
   - Transform applied to Skia paints, not to individual nodes.
   - Renders circles for commits, lines/curves for parent edges, labels at readable zoom.
6. Tap a commit → detail sheet (commit message, author, SHA, date).
7. Hook up graph canvas to the `[owner]/[repo]` route, loading data from local SQLite.

**Acceptance criteria:**
- Graph renders for a 1000-commit repo in under 500ms after SQLite read completes.
- Pan and pinch feel smooth (60fps target) on web in Chrome, iOS simulator, and Android emulator.
- Tapping a commit shows the correct detail sheet.
- Graph is visually correct: parents connect to children, branch topology readable.
- `docs/PROGRESS.md` updated.

---

## Phase 3 — Semantic Zoom

**Goal:** Three tiers (week buckets / PR clusters / individual commits) with smooth cross-tier transitions driven by zoom level.

**Tasks:**
1. Implement `core/graph/tier0Layout.ts` — week-bucket layout. Groups commits by ISO week, produces rectangles sized/colored by count.
2. Implement `core/graph/tier1Layout.ts` — cluster layout. Groups commits by PR number (if present) or by contiguous same-author runs on the same branch.
3. Implement `core/graph/tierSelection.ts` — pure function: `zoomLevel → tier0 | tier1 | tier2` with hysteresis at thresholds to prevent flicker.
4. PR enrichment: optional pass in `core/github/sync.ts` that fetches `/repos/{owner}/{repo}/pulls` and back-fills `pr_number` on commits by matching merge commit SHAs. Gracefully no-ops if unavailable.
5. Update `components/GraphCanvas.tsx`:
   - Compute all three layouts once on data load.
   - Tier selection driven by Reanimated-derived zoom value.
   - Cross-tier transitions: opacity crossfade between tier layouts, positions interpolated for commits that exist in both.
6. Commit message parsing heuristic for PR detection: match `(#NNN)` or `Merge pull request #NNN` patterns as fallback when `/pulls` enrichment didn't run.

**Acceptance criteria:**
- At low zoom: see week-bucket blocks, readable from overview.
- At mid zoom: see PR/cluster labels with commit counts.
- At high zoom: see individual commits with messages.
- Transitions between tiers are smooth (no snap, no flicker).
- `docs/PROGRESS.md` updated.

---

## Phase 4 — Other Views

**Goal:** Author lanes and heatmap calendar views, plus a view switcher.

**Tasks:**
1. Implement `core/graph/authorLanesLayout.ts` — per-tier layouts where y-axis is author (sorted by commit count desc), x-axis is real time. Merge arcs between authors.
2. Implement `components/views/AuthorLanes.tsx` — wraps `GraphCanvas` with author-lane layouts injected.
3. Implement `components/views/HeatmapCalendar.tsx` — plain RN grid, not Skia. Weeks as rows or columns, days as cells, color intensity by commit count.
4. Tap heatmap cell → navigate to currently-active graph view with a date filter applied for that day.
5. View switcher UI: segmented control at the top of `[owner]/[repo]`, three options, persists selection per-repo in local storage (key: `view:${owner}/${repo}`).
6. Update `core/graph/types.ts` with a `ViewMode` enum; layout functions become `(commits, viewMode, tier) => GraphLayout`.

**Acceptance criteria:**
- All three views render correctly for the same repo.
- View selection persists across app restarts.
- Heatmap cell tap → graph view with that day's commits filtered in.
- `docs/PROGRESS.md` updated.

---

## Phase 5 — Filter-first UX

**Goal:** Fast, shareable filtering by date range, author, branch, file path.

**Tasks:**
1. Define filter model in `core/graph/filters.ts`: `{ dateFrom?, dateTo?, authors?: string[], branches?: string[], paths?: string[] }`.
2. Implement filter application in `core/storage` — SQL-level filtering for speed (WHERE clauses, not in-memory).
3. Filter UI: bottom sheet / side drawer with chips and controls.
4. Quick-filter chips visible by default: "Last 7 days", "Last 30 days", "This branch", "Just me".
5. File-path filter uses GitHub `/commits?path=X` — fetch-on-demand, cache results by `(repo, path)` key.
6. URL params carry filter state (Expo Router handles query strings on web and deep links on native).
7. "Copy share link" action → copies current URL with filter state encoded.

**Acceptance criteria:**
- Filter changes re-render the graph in under 200ms for repos with <10k commits.
- Shared URL reproduces the exact filtered view on another device.
- File-path filter works for any file in the repo.
- `docs/PROGRESS.md` updated.

---

## Phase 6 — Polish

**Goal:** Production-ready feel.

**Tasks:**
1. Loading, empty, error states for every screen.
2. Large-repo perf pass:
   - Profile Skia frame times on a 50k-commit repo.
   - Virtualize: only render nodes within viewport + margin.
   - If needed, move layout computation to a Web Worker (web) / runOnJS-off-main-thread (native).
3. Mobile web: safe areas, touch target sizes, pull-to-refresh on repo view.
4. Native: iOS haptics on tier transitions, Android hardware back handling.
5. "Reset" screen: wipes local DB + token, returns to sign-in. Important for a privacy-forward tool.
6. First-run onboarding: one-screen explainer of what the views mean.

**Acceptance criteria:**
- 50k-commit repo usable without frame drops during pan/zoom.
- Reset flow verified: data gone, token gone, clean slate.
- All screens have loading/empty/error states.
- `docs/PROGRESS.md` updated.

---

## Phase 7 — Ship

**Goal:** Public web URL, TestFlight build, Android internal track build.

**Tasks:**
1. EAS Build profiles for iOS and Android.
2. Web deploy to a custom domain.
3. Basic landing page copy.
4. GitHub OAuth app registration (production).
5. App Store Connect setup for TestFlight.
6. Screenshots and store listing copy.

**Acceptance criteria:**
- Public web URL live, device flow works end-to-end.
- TestFlight build installable and functional.
- Android APK installable and functional.
- `docs/PROGRESS.md` final update.
