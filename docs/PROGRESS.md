# Progress

Living status file. Update when finishing a phase, or when anything meaningful changes.

## Status

| Phase | State | Notes |
|---|---|---|
| 0 — Scaffolding | complete (2026-04-19) | Expo SDK 54 (SDK 55 not yet released) |
| 1 — Auth & Sync | complete (2026-04-19) | |
| 2 — Graph Canvas + Tier 2 | not started | |
| 3 — Semantic Zoom | not started | |
| 4 — Other Views | not started | |
| 5 — Filter-first UX | not started | |
| 6 — Polish | not started | |
| 7 — Ship | not started | |

## Changelog

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
- **Native smoke test** — iOS/Android simulators not exercised yet; shared code is the same so risk is low, but worth a real run before Phase 2 wraps. _Target: early Phase 2._
