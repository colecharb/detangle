# Progress

Living status file. Update when finishing a phase, or when anything meaningful changes.

## Status

| Phase | State | Notes |
|---|---|---|
| 0 — Scaffolding | complete (2026-04-19) | Expo SDK 54 (SDK 55 not yet released) |
| 1 — Auth & Sync | complete (2026-04-19) | |
| 2 — Graph Canvas + Tier 2 | complete (2026-04-19) | swimlane tier 2 only; authorLanes tier 2 still stub (phase 4) |
| 3 — Semantic Zoom | complete (2026-04-19) | swimlane only; tier-1 cluster edges + cluster-tap drill-in deferred |
| 4 — Other Views | not started | |
| 5 — Filter-first UX | not started | |
| 6 — Polish | not started | |
| 7 — Ship | not started | |

## Changelog

### 2026-04-19 — Phase 3 complete

**Tier selection** (`core/graph/tierSelection.ts`) — pure function returning `0 | 1 | 2` from `(zoomLevel, viewportWidth, totalCommits, currentTier?, context?)`. Base thresholds at `scale = 0.7` (2↔1) and `scale = 0.35` (1↔0); hysteresis buffer `H = 0.05` only applies when `currentTier` is supplied. Clamps: `<10` commits stays at 2, `<50` never drops below 1, history span `<14d` never drops below 1. Phone-viewport bias (`< 500px`) bumps the 1↔2 edge up. Exports a `TIER_THRESHOLDS` constant so the canvas worklet can mirror literals without crossing the worklet boundary.

**Tier 0 layout** (`tier0LayoutSwimLane`). Week-bucket histogram, vertical stack with newest week on top. ISO-week keys via new `core/graph/time.ts` (`isoWeekKey`, `isoWeekStart`, `weekKeysBetween`, all UTC). Empty weeks between min/max are rendered at minimum height in the coldest color so vertical position stays monotonic with time. Colors quintile-binned over the bucket counts themselves (relative-to-repo heat). Edges are empty — tier 0 is a histogram.

**Tier 1 layout** (`tier1LayoutSwimLane`). Runs `topoSort + assignLanes` so cluster geometry reuses tier 2's row/lane math — this spatial alignment is what makes the opacity-only crossfade read correctly. Grouping precedence: (1) commits with a non-null `prNumber` collapse into one cluster; (2) fallback contiguous same-author same-lane runs; single-commit runs are valid. Clusters are narrow capsules (`LANE_WIDTH`) with `height = (lastRow - firstRow + 1) * ROW_HEIGHT`, colored with the lane palette. Labels: `"#123 Title · 5 commits"` for PRs when a title is cached, `"{author} · N"` for author runs, truncated first line for single-commit runs. Edges intentionally omitted at tier 1 (deferred to phase 6 polish).

**Layout dispatcher** grew an optional `LayoutContext = { prTitles?: Map<number, string> }` trailing parameter. Tier 1 labels read PR titles from it.

**PR title cache** — new `pulls` table `(repo_id, number, title, merge_commit_sha)` keyed by `(repo_id, number)`. New `core/storage/pulls.ts` with `upsertPulls` / `listPulls` following the `refs.ts` pattern. `enrichWithPullRequests` now upserts pulls alongside its existing `UPDATE commits SET pr_number` pass.

**Sync wiring** — `syncRepo` now runs `enrichWithPullRequests` as a final best-effort step inside a try/catch; any failure is swallowed and `prsEnriched = 0`. `SyncResult` grew a `prsEnriched` field; the route's status line appends ` · N PRs` when non-zero. The existing regex heuristic in `parsePrNumberFromMessage` continues to populate `pr_number` at commit-insert time; `COALESCE(excluded.pr_number, commits.pr_number)` keeps the two passes non-destructive.

**Canvas** (`components/GraphCanvasSkia.tsx`). New props shape: `{ layouts: Record<Tier, GraphLayout>, onCommitTap }`. Three `<Group>` subtrees inside the outer transform, each with its own opacity `useDerivedValue`. Opacities are pure worklet smoothstep through `[threshold - H, threshold + H]` buffers — outside transition zones exactly one tier has `opacity = 1`, inside, two tiers crossfade summing to 1. Active tier for tap routing and mount short-circuit is a `Tier` shared value updated from `useAnimatedReaction(() => scale.value)`; `runOnJS` mirrors it to `jsActiveTier` state. Tap handling is gated on `jsActiveTier === 2`; tier 0 and tier 1 taps are inert (cluster-tap drill-in deferred per phase-3 scope decision).

**Route** (`app/[owner]/[repo].tsx`) loads commits/refs/pulls in parallel, builds the `prTitles` map, and precomputes all three swimlane layouts in one shot on load/resync. The canvas receives all three at once.

**CORE_API.md** updates (same commits as code): `selectTier` signature + `TIER_THRESHOLDS` constant, `LayoutContext` and the `layoutGraph` / `tier1LayoutSwimLane` signature bump, `SyncResult.prsEnriched`, new `Pull` type and accessors.

**Verification.**
- `tsc --noEmit` clean after every intermediate commit.
- `/core` purity grep clean (no `react-native`, `expo-*`, `@shopify/react-native-skia`, `window.`, `document.` imports).
- Dispatcher returns for all `(swimlane, t)` in `{0, 1, 2}`; `authorLanes` / `heatmap` still throw the phase-4 stubs.
- Not yet visually smoke-tested on web or device for this phase; first run will validate threshold calibration and crossfade feel. Android emulator boot still unexercised (carried forward from phase 1).

**Deviations from plan.**
- Commits 8 and 9 (canvas + route) were bundled into a single commit. Splitting them left the intermediate tree with a type error because the canvas API and the route's call site are a single logical change.
- `weekKeysBetween` was added alongside `isoWeekKey` / `isoWeekStart` (not originally called out) to simplify filling empty weeks in the tier-0 layout.

**Carried forward to later phases.**
- Tier-1 cluster-to-cluster edges — phase 6 polish candidate.
- Cluster-tap drill-in (tier 1) — phase 4, when the cluster-list / other-views UI machinery lands.
- Tier-0 bucket-tap → date-range filter — phase 5, fits with filter-first UX.
- Author-lanes and heatmap views — phase 4.
- Threshold calibration from live smoke testing — tune `{0.35, 0.7}` based on label legibility and commit density if needed.

### 2026-04-19 — Phase 2 complete

**Layout algorithms** (`core/graph/`).
- `topology.ts` — Kahn's topo sort with `committedAt`-desc tiebreak so the newest commit lands at the top. Orphaned parents (parent SHA not in input) are ignored rather than throwing.
- `laneAssignment.ts` — classic git-graph lane algorithm. Maintains an `active` slot array of expected-next SHAs; a commit lands in the slot expecting it or claims the first empty slot; its first parent replaces that slot, additional parents spawn new slots.
- `layout.ts` — `tier2LayoutSwimLane` produces `CommitNode` at `(PADDING + lane*LANE_WIDTH, PADDING + row*ROW_HEIGHT)`, colored from an 8-color palette keyed by lane, with one `Edge` per known parent (`kind: 'merge'` when the child has ≥2 parents, else `'parent'`). `layoutGraph` dispatches only `(swimlane, 2)`; all other (tier, viewMode) combinations throw an explicit `'not implemented (phase N)'`.

**Graph canvas** — split by platform because Skia's web build needs CanvasKit loaded before any `@shopify/react-native-skia` module evaluates.
- `components/GraphCanvasSkia.tsx` — the actual Skia component (imports `Canvas`/`Circle`/`Line`/`Text`/`useFont`/etc.).
- `components/GraphCanvas.web.tsx` — wraps it in `WithSkiaWeb` with `opts={{ locateFile: f => /${f} }}` so `LoadSkiaWeb()` resolves CanvasKit before the lazy `import('./GraphCanvasSkia')` runs.
- `components/GraphCanvas.native.tsx` — renders `GraphCanvasSkia` directly.
- `components/GraphCanvas.d.ts` — type-only shim so `@components/GraphCanvas` resolves for TypeScript without shadowing Metro's platform resolution (a plain `.ts` shim would — `.d.ts` makes TypeScript-only explicit).
- Skia canvas: `<Group transform={…}>` driven by a Reanimated `useDerivedValue` composed from three shared values (`translateX`, `translateY`, `scale`).
- Gestures: pan uses `withDecay({ velocity })` on release for inertia, with `cancelAnimation` at pan/pinch/wheel start so gestures don't fight the decay. Pinch zooms around its focal point. Tap inverts the transform to pick the nearest node within `radius + 6`. Composition: `Simultaneous(pinch, Exclusive(tap, pan))`.
- Web wheel: replaced the React `onWheel` prop (passive; `preventDefault` is ignored) with a non-passive `addEventListener('wheel', …, { passive: false })` attached via ref. `ctrlKey` true → zoom around cursor (focal in canvas-local coords via `getBoundingClientRect`); `ctrlKey` false → two-finger swipe pans by `deltaX`/`deltaY`. `touchAction: 'none'` on the wrapper claims touch pinch on mobile web too.
- Labels use Skia `<Text>` with `useFont(require('../assets/fonts/SpaceMono-Regular.ttf'), 12)`; opacity driven by a `useDerivedValue` that toggles at `scale >= 0.8`. Bundled font so web and native render identically.

**Detail sheet** (`components/CommitDetailSheet.tsx`) — RN `Modal` (`transparent`, `animationType='slide'`) styled with NativeWind. Backdrop-tap and Close button both dismiss. No new dependency added.

**Route wire-up** (`app/[owner]/[repo].tsx`).
- On mount (`useRef`-guarded bootstrap), load the repo from SQLite, render the cached graph immediately, then fire a background sync. Previously the graph only rendered after a fresh sync completed.
- Sync completion re-runs `loadGraph` to pick up new commits without a full reload.
- Header restyled to a compact top bar (back / title / Resync + status line); below it the canvas fills remaining space; the detail sheet is mounted at the root of the screen.
- Back button uses `router.back()` (with `router.replace('/repos')` fallback when there's no history) rather than a `<Link>` — pushing another `/repos` onto the stack created a growing nav history.

**CanvasKit runtime.** Added a `postinstall` npm script that copies `node_modules/canvaskit-wasm/bin/full/canvaskit.wasm` into `public/canvaskit.wasm`. Expo serves `public/` at the web root; the Skia web loader finds it at `/canvaskit.wasm`. WASM is gitignored so it stays in lockstep with the installed package.

**Native auth compatibility** — surfaced during Phase 2 smoke testing on Expo Go iOS, fixed in three commits:
- DOMException → plain `Error` with `name = 'AbortError'`: Hermes doesn't expose `DOMException`, so the device flow crashed the moment `AbortController.abort()` fired.
- JSON bodies → `application/x-www-form-urlencoded`: matches GitHub's documented encoding for `/login/device/code` + `/login/oauth/access_token`.
- Poll-loop retry on transient fetch errors: when the app backgrounds during authorization (user switches to Safari to enter the code), iOS tears down the in-flight XHR and whatwg-fetch surfaces "Network request failed". Catching non-abort errors and `continue`-ing the loop lets the next poll pick up the minted token on return.

Also refactored `DeviceFlowModal`'s effect to hold `onSuccess` in a ref and drop it from deps — an inline arrow in the parent was re-firing the effect on every render and aborting the flow.

**Verification.**
- `tsc --noEmit` clean after every intermediate commit.
- `/core` purity grep clean (no imports from `react-native`, `expo-*`, `@shopify/react-native-skia`, `react-dom`).
- Metro web bundle succeeds; `/` and `/[owner]/[repo]` both return 200 with no SSR errors.
- **Smoke-tested end-to-end on web (Firefox) and Expo Go iOS**: connect → device flow → repo list → tap repo → graph renders → pan/pinch/tap → detail sheet dismisses.

**Deviations from plan.**
- The original plan used `matchFont`; replaced with `useFont(require(...))` because CanvasKit on web ships with an empty FontMgr and `matchFont('Arial')` returned null.
- GraphCanvas ended up as four files (split + shim) instead of a single component — forced by Skia's web init order. Native builds ignore the `.web.tsx` + `.d.ts` and see just `.native.tsx` + `GraphCanvasSkia.tsx`.
- Three Phase-1-adjacent auth fixes shipped as part of this phase because they were blocking Phase 2 smoke testing on iOS. Scoped to conventional-commits prefixes `fix(core/github)` so a later audit reads cleanly.
- `max-w-2xl` root constraint from Phase 1 is still in place for the graph route. Deferred.

**Carried forward to later phases.**
- Tier 0 / Tier 1 layouts and crossfade transitions — Phase 3.
- `tier2LayoutAuthorLanes` + heatmap — Phase 4.
- Full-width graph on desktop (break out of `max-w-2xl` root centering for the graph route) — Phase 6 polish candidate.

### 2026-04-19 — Phase 1 complete

**Auth — GitHub App device flow with refresh tokens** (superseded the initial OAuth App path; see `DECISIONS.md`).
- `core/github/auth.ts` — `startDeviceFlow`, `pollForToken` (returns bundle with access + refresh + expiries), `refreshAccessToken`. Typed errors for denied / expired / refresh-expired.
- Session stores a `TokenBundle` in platform secret storage and auto-refreshes ~60s before access-token expiry; de-dupes concurrent refreshes via a ref.
- `DeviceFlowModal` copies the user code to clipboard, opens the verification URL in a new tab on web (so the polling tab stays alive) / external browser on native.
- Scope is not requested — GitHub Apps configure permissions at registration (we run on read-only `Contents` + `Metadata` + `Pull requests`).

**REST client** (`core/github/client.ts`).
- Authed fetch with `Link: rel="next"` pagination (and a `requestPagedNested` helper for endpoints that wrap their arrays).
- Typed `GitHubAuthError` (401) and `GitHubRateLimitError` (403/429 with remaining=0, carries reset timestamp).
- `createClient(getToken)` takes a token getter so each request gets a fresh access token through the session's refresh loop.
- `listRepos` aggregates over `/user/installations` → `/user/installations/{id}/repositories`; returns `{ repos, installationCount }` so the UI can tell apart "not installed" from "installed with no shared repos".

**Sync** (`core/github/sync.ts`).
- `syncRepo` diffs remote ref tips against stored tips, only walks changed refs, and stops paginating a branch at the first SHA already in the DB.
- Extracts `pr_number` from merge/squash commit messages as a heuristic; `enrichWithPullRequests` can back-fill authoritative numbers from `/pulls`.

**Storage** — `core/storage/{repos,commits,refs}.ts` fully implemented with idempotent upserts. `listCommits` supports the full `CommitFilter`.

**Routes.**
- `/` landing: redirect to `/repos` when authed, otherwise show Connect GitHub button.
- `/repos` repo picker: live text-filter, `Private` pill inline next to the repo name, sign-out, install CTA when `installationCount === 0` or the install has no shared repos (links to `github.com/apps/<slug>/installations/new` via `EXPO_PUBLIC_GITHUB_APP_SLUG`).
- `/[owner]/[repo]`: auto-runs sync on mount with a progress callback, shows commits-added/refs-updated/duration, Resync button, typed rate-limit message.
- Global: root `_layout` caps every route at `max-w-2xl` centered so the desktop layout doesn't sprawl; mobile unchanged.

**Platform surface additions.**
- `@platform/env` (new) — per-platform URLs. Web returns `'/__gh'` so the device-flow endpoints hit the Metro dev proxy; native returns `'https://github.com'` directly.
- `@platform/storage` on web now uses **sql.js** (asm.js build) instead of expo-sqlite (the OPFS worker was unrecoverable in Firefox; `DECISIONS.md` has the full story). Native still uses expo-sqlite.

**Dev infrastructure.**
- `metro.config.js` proxies `/__gh/*` to `github.com/*` with permissive CORS + OPTIONS short-circuit — GitHub's OAuth endpoints don't set CORS, so browsers block direct fetches. Verified with a real device-code response end-to-end.
- Metro's `assetExts` includes `wasm`.

**Verification.**
- `tsc --noEmit` clean; `/core` purity grep clean.
- End-to-end manual run on web: Connect GitHub → code → authorize & install the GitHub App → land on `/repos` → tap a repo → sync runs → "Synced N commits" renders.

**Deviations from plan.**
- Migrated OAuth App → GitHub App mid-phase for fine-grained read-only permissions. OAuth App decision superseded in `DECISIONS.md`.
- Replaced expo-sqlite on web with sql.js due to OPFS instability.
- Added a Metro CORS proxy for OAuth endpoints. Dev-only; production web deployment will need either a real proxy, native-only auth, or a different strategy — flagged in `Deferred`.

**Carried forward to later phases.**
- Web persistence for the commit cache — sql.js runs in-memory on web today, so every reload re-syncs. Serialize-to-IndexedDB on mutation is the fix (Phase 6 polish candidate).
- Production web auth needs a CORS solution that doesn't rely on the Metro dev proxy (Phase 7 ship).
- Native boot not manually exercised yet (no simulators in the dev env at the time of Phase 1 sign-off).

### 2026-04-19 — Phase 0 complete
- Scaffolded Expo universal app from `tabs` template, renamed to `detangle`.
- Installed and configured: NativeWind v4, `@shopify/react-native-skia`, `react-native-gesture-handler`, `react-native-reanimated` (v4 with `react-native-worklets`), `expo-sqlite`, `expo-secure-store`.
- `/core` stubs in place matching `CORE_API.md`. `core/storage/schema.ts` fully implemented.
- `/platform` adapters implemented for web (IndexedDB + expo-sqlite WASM) and native (expo-secure-store + expo-sqlite).
- Landing route at `/` renders "Detangle" title; gesture-handler root wrapper in place.
- `tsc --noEmit` passes. Core purity grep clean. Web static export succeeds; "Detangle" present in rendered HTML.
- Deviations from roadmap: used SDK 54 instead of 55 (not yet released), used `tabs` template instead of blank. Both documented in `DECISIONS.md`.
- Did not verify iOS/Android simulator boot — deferred to when simulators are available. Web bundle success indicates the shared code compiles; native-specific resolution is low risk.

### 2026-04-19 — Project scoped
- Docs initialized: `CLAUDE.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `CORE_API.md`, `PROGRESS.md`.

---

## How to update this file

When you finish a phase:
1. Change its row in the Status table to `complete` with the date.
2. Add an entry under Changelog with: what shipped, what was deferred, anything that surprised you, anything that should change in later phases based on what you learned.

When you're mid-phase and something notable happens (blocker, scope change, deferred task):
- Add a Changelog entry. Keep the Status row on `in progress`.

Deferred items from a phase should be tracked in a "Deferred" section below, with a note about which phase they should land in.

## Deferred

- **Web commit-cache persistence** — sql.js runs in-memory; every reload re-syncs. Add IndexedDB serialization on mutation. _Target: Phase 6 polish._
- **Production web auth** — GitHub's OAuth endpoints have no CORS, and our Metro `/__gh` proxy is dev-only. Options: deploy a tiny proxy (minimal backend), ship native-only auth, or accept PAT as a web fallback. _Target: Phase 7 ship._
- **Android smoke test** — iOS is now verified on Expo Go; Android still unexercised. Shared code is the same so risk is low. _Target: Phase 3 kickoff._
- **Graph full-width on desktop** — the `max-w-2xl` root centering from Phase 1 constrains the canvas. Either per-route opt-out for `/[owner]/[repo]` or move the constraint down into list views. _Target: Phase 6 polish._
