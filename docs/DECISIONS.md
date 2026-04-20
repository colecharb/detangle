# Decisions

Running log of significant decisions. Append new ones at the top.

Format: `## YYYY-MM-DD — Title` / Decision / Rationale / Alternatives considered.

---

## 2026-04-19 — Phase 3: opacity-only crossfade, tier-1 edges omitted, cluster taps inert

**Decision:** Semantic-zoom tier transitions crossfade by opacity alone (no position-interpolation between layouts). Tier 1 renders no cluster-to-cluster edges in v1. Tapping a Tier 1 cluster or a Tier 0 bucket is inert — only Tier 2 commit taps are handled in phase 3.

**Rationale:**
- Tier 1 cluster geometry reuses Tier 2's `topoSort + assignLanes` math (same x per lane, same y per row range), so clusters spatially overlay the commits they contain. Crossfading opacity between aligned shapes reads as "same graph, different scale" without extra interpolation work.
- Position-interpolation would require a stable identity mapping from every `CommitNode` to its containing `ClusterNode` / `BucketNode`, plus per-frame interpolation across the worklet boundary carrying 3× the data. The visual payoff at a 5% hysteresis buffer is small.
- Cluster-to-cluster edges add an anchor-picking step per cluster and an extra reduction pass on the commit graph. Tier 2 still shows topology; tier 1 is the "shape of activity" zoom, not the structure zoom.
- Cluster-tap drill-in would need a new sheet component and commit-list UI — natural fit for phase 4 when multi-view / cluster-list infrastructure lands.
- Tier 0 bucket tap → date-range filter fits phase 5's filter-first UX, not phase 3's semantic-zoom scope.

**Alternatives considered:**
- Full position-morph between tiers — rejected; complexity/payoff ratio is poor at the chosen hysteresis buffer. Revisit in phase 6 polish if users report flicker.
- Inline cluster edges computed from first/last commit anchors — rejected; spec creep for a tier whose job is gestalt, not topology.
- Ship cluster-tap drill-in in phase 3 — rejected; UI machinery is cleaner to build alongside the other views in phase 4.

**Revisit when:** Phase 6 polish (crossfade feel, cluster edges) or phase 4 (cluster-tap drill-in with the other-views UI).

---

## 2026-04-19 — sql.js on web, expo-sqlite on native

**Decision:** `/platform/storage.web.ts` uses `sql.js` (pure-WASM SQLite in the main thread). `/platform/storage.native.ts` continues to use `expo-sqlite`. The WASM binary is vendored at `public/sql-wasm.wasm` and served by Expo's static hosting.

**Rationale:**
- expo-sqlite's web build uses a Worker + `AccessHandlePoolVFS` (OPFS sync access handles). Those handles can get stuck in a state that survives page reloads, is not clearable from JS, and kills the worker — reproducible in Firefox and unrecoverable once it happens.
- sql.js runs in the main thread with no OPFS dependency, so the whole class of "dead worker / stuck handle" failures disappears.
- The trade-off is main-thread execution (potential UI jank on large queries) and no persistence by default. For the semantic-zoom UX we can mitigate jank with `requestIdleCallback`-batched queries or migrate to a SharedWorker later; persistence can be added by serializing to IndexedDB.

**Known limitations (to fix in Phase 6 polish):**
- Commit cache is session-only on web — reload = re-sync. Token stays in IndexedDB so the user doesn't re-auth.
- Main-thread SQL means very large queries can block paint. Monitor during Phase 2 perf work.

**Alternatives considered:**
- Stay on expo-sqlite + reload-based OPFS recovery — rejected; proven unreliable.
- Roll our own IndexedDB-backed `Database` that translates our SQL subset — rejected; brittle and a lot of surface to test.
- Use CDN-hosted sql.js — rejected; privacy-first tool shouldn't depend on external hosts.

**Revisit when:** expo-sqlite's web path becomes reliable across browsers, or when main-thread SQL becomes a perf bottleneck.

---

## 2026-04-19 — Web Metro needs `wasm` in assetExts

**Decision:** `metro.config.js` adds `'wasm'` to `config.resolver.assetExts` so expo-sqlite's web worker can import its WASM binary.

**Rationale:**
- expo-sqlite 16 (the SDK 54 version) has `import wasmModule from './wa-sqlite/wa-sqlite.wasm';` inside the web worker.
- Metro's default `assetExts` in SDK 54 doesn't include `wasm`, so resolution fails during web bundling.
- Adding `wasm` treats it as an asset (copy + return URL) which is what the worker expects.

**Alternatives considered:**
- Custom Metro transformer for `.wasm` — rejected; assetExts is the simple, supported path.
- Wait for expo-sqlite to fix the issue upstream — rejected; trivial one-line workaround.

**Revisit when:** Upgrading to a newer SDK where the default `assetExts` might already include `wasm`. If so, the workaround is a no-op but harmless.

---

## 2026-04-19 — Scaffold on Expo SDK 54, not 55

**Decision:** Phase 0 uses Expo SDK 54 (what `create-expo-app@latest` installs today), not SDK 55 as `ARCHITECTURE.md` originally targeted.

**Rationale:**
- SDK 55 is not yet released as of scaffolding date.
- SDK 54 ships React 19.1, React Native 0.81, Reanimated 4.1, and all other libraries we need with compatible versions.
- Upgrading to 55 when it ships is a standard `npx expo install --fix` flow — no architectural commitment.

**Alternatives considered:**
- Wait for SDK 55 — rejected; blocks all Phase 1+ work indefinitely.
- Use SDK 53 (more stable) — rejected; no reason to downgrade.

---

## 2026-04-19 — Start from `tabs` template, delete tabs

**Decision:** Scaffold via `npx create-expo-app@latest --template tabs`, then delete template's `app/(tabs)/`, `app/modal.tsx`, `components/`, and `constants/` before writing our own routes.

**Rationale:**
- `tabs` template pre-wires Expo Router + TypeScript + `typedRoutes` + splash/icon assets — less manual setup than `blank`.
- We replace all routes in Phase 1 anyway; deleting a few files is cheaper than hand-wiring Router.

**Alternatives considered:**
- `--template blank` — rejected; would need to hand-configure Expo Router entry point and typed routes.
- `--template default` — name inconsistent across SDK versions; `tabs` is stable.

---

## 2026-04-19 — Reanimated 4 uses `react-native-worklets/plugin`

**Decision:** `babel.config.js` plugins array ends with `react-native-worklets/plugin`, not the deprecated `react-native-reanimated/plugin`.

**Rationale:**
- Reanimated 4 extracted worklet compilation to the separate `react-native-worklets` package.
- The old plugin name still works as a forward-compat shim but is not the canonical path.
- SDK 54 already installs `react-native-worklets` as a direct dependency.

**Alternatives considered:**
- Use the legacy `react-native-reanimated/plugin` alias — rejected; works today but is deprecated.

---

## 2026-04-19 — expo-sqlite on web needs COOP/COEP headers in production

**Decision:** Production web hosting must serve `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers so expo-sqlite's OPFS persistence works (requires `SharedArrayBuffer`).

**Rationale:**
- `expo-sqlite` web uses WASM with OPFS-backed storage; `SharedArrayBuffer` requires cross-origin isolation.
- Dev server handles this automatically; static hosts (Vercel, Netlify, EAS Hosting) need explicit header config.
- Without these headers, web falls back to in-memory SQLite and loses data on reload.

**Alternatives considered:**
- IndexedDB adapter on web — deferred; keep as fallback if a host can't be made COOP/COEP compliant.
- Session-only cache on web — rejected; user expects persistence across reloads.

**Revisit when:** Phase 7 (shipping). Confirm the chosen host supports these headers before launch.

---

## 2026-04-19 — No backend in v1

**Decision:** The app is client-only. No servers, no Supabase, no edge functions.

**Rationale:**
- Strongest privacy story: GitHub token never leaves the device, nothing to breach.
- Zero ops burden — static hosting only.
- Scales "for free" — each user brings their own GitHub rate limit (5000/hr).
- Simpler architecture — one fewer moving part.
- No accounts, no email — fastest possible onboarding.

**Alternatives considered:**
- Supabase for auth/caching — rejected; added complexity and a second party holding user tokens, for features (cross-device sync, shared views) that aren't needed in v1.
- Tiny worker just for caching — rejected; same objection, smaller version.

**Revisit when:** Shared features become real (public repo gallery, team views, share-a-view URLs with embedded state). Then evaluate adding a minimal backend.

---

## 2026-04-19 — Expo universal, not Next.js + separate RN app

**Decision:** One Expo Router codebase for web + iOS + Android. React Native Web for the web build.

**Rationale:**
- One codebase, one router, one auth flow, one styling system.
- Matches existing stack fluency (React Native, Expo, TypeScript).
- When native ships, it's free — same screens, same navigation, same logic.
- Skia has a web build (CanvasKit WASM), so the graph rendering is portable.

**Alternatives considered:**
- Next.js for web, separate Expo app for native — rejected; duplicate work, two codebases drift apart.
- Next.js web only, native "later" — rejected; "later" tends to never happen, and the stack fluency advantage favors Expo.

---

## 2026-04-19 — Skia for the graph surface, not SVG

**Decision:** Graph rendering happens inside a single `<Canvas>` from `@shopify/react-native-skia`.

**Rationale:**
- RN's `<View>`/`<Text>` compile to divs on web and are too heavy for thousands of nodes with pan/zoom.
- Skia is GPU-accelerated on all platforms (native Skia on iOS/Android, CanvasKit WASM on web).
- Same rendering code everywhere — no platform-specific rendering divergence.
- Gesture → transform → Skia paint pipeline is fast and predictable.

**Alternatives considered:**
- SVG via `react-native-svg` — works but goes through a translation layer on web and gets slow past a few hundred nodes.
- Raw `<svg>` on web, RN components on native — rejected; violates the one-codebase rule.
- Three.js / WebGL — overkill and non-portable.

---

## 2026-04-19 — GitHub App device flow, not OAuth App

**Decision:** Auth uses a **GitHub App** with the device flow and user-access tokens. Access tokens expire (default 8h) and are rotated via a refresh token (default 6mo); session layer auto-refreshes with ~60s skew before expiry. OAuth App path (which we used initially) is superseded.

**Rationale:**
- GitHub Apps support fine-grained, read-only permissions (e.g., `Contents: Read`, `Metadata: Read`). OAuth Apps only have `repo` / `public_repo` — the former grants write capability we never use, and we only want to read.
- Device flow UX is identical for GitHub Apps — no extra moving parts in our app compared to OAuth.
- Users pick exactly which repos to share at install time, which is a nicer privacy story than OAuth's "all or nothing".
- Expiring tokens are where GitHub is heading; the non-expiring option is being deprecated. ~30 lines of refresh logic buys us long-term alignment.

**What changed in code:**
- `pollForToken` returns `{ accessToken, refreshToken, accessTokenExpiresIn, refreshTokenExpiresIn }` instead of a bare string.
- New `refreshAccessToken(clientId, refreshToken, authBase)`.
- Session stores a `TokenBundle` (JSON) in secure storage with absolute expiry timestamps.
- `createClient(getToken)` takes a token getter so each API call gets a freshly-refreshed token.
- `listRepos` hits `/user/installations` then `/user/installations/{id}/repositories` (GitHub Apps scope access per-installation).

**Alternatives considered:**
- OAuth App with `public_repo` — rejected; doesn't cover private repos and still carries write capability.
- Fine-grained PAT — rejected for v1; users would have to visit GitHub, pick scopes, and paste — same "janky UX" concern as before.
- GitHub App with non-expiring tokens — rejected; that option is being deprecated.

---

## 2026-04-19 — GitHub OAuth device flow, not web flow or PAT (superseded)

**Decision:** Auth uses GitHub's OAuth device flow exclusively.

**Status:** Superseded 2026-04-19 by the GitHub App decision above. Keeping here for context.

**Rationale:**
- No client secret required — safe to ship in a public client bundle.
- Works identically on web and native (no deep-link redirect dance).
- Better UX than pasting a PAT.
- Standard GitHub primitive, well-supported.

**Alternatives considered:**
- OAuth web flow — rejected; requires a `client_secret` and therefore a backend, which we don't want.
- Personal Access Tokens — rejected for v1; janky UX. Might add as an option later for users who prefer it.
- GitHub App with user access tokens — deferred; device flow covers current needs. Revisit if fine-grained permissions become important.

---

## 2026-04-19 — expo-sqlite for commit cache, not IndexedDB directly

**Decision:** Commit cache lives in `expo-sqlite`, which has a web build (WASM) with the same API as native.

**Rationale:**
- Same query language and API on all platforms.
- SQL is a better fit than IndexedDB for this data shape (joins, indexed date-range queries).
- Well-supported by Expo.

**Alternatives considered:**
- IndexedDB on web, SQLite on native — rejected; would require two data access implementations.
- PouchDB / RxDB — rejected; overkill for a local-only store.

**Known risk:** `expo-sqlite` web has occasional rough edges. If hit, fallback is an IndexedDB adapter behind the same interface.

---

## 2026-04-19 — Semantic zoom as the core UX differentiator

**Decision:** Three distinct visualization tiers (week buckets / PR clusters / individual commits), selected by zoom level, with smooth transitions. Not just LOD text hiding.

**Rationale:**
- LOD alone ("hide labels when small") produces a prettier version of the same "cloud of unreadable dots" problem.
- Each zoom level should show genuinely different information appropriate to that scale.
- This is the feature that makes the app worth using over Le Git Graph or GitHub's network graph.

**Alternatives considered:**
- Single-tier with LOD text hiding — rejected per above.
- Discrete zoom steps with snapping — rejected; continuous zoom with interpolation feels better.

---

## 2026-04-19 — v1 ships three views, not one

**Decision:** Swim lane, author lanes, and heatmap calendar all ship in v1.

**Rationale:**
- Each answers a different question: structure (swim lane), people (author lanes), cadence (heatmap).
- Heatmap is cheap to build (plain grid, not Skia).
- Author lanes reuses swim lane's tier infrastructure with a different y-axis.
- Three views from day one is the differentiation story.

**Alternatives considered:**
- Ship swim lane only, add others later — rejected; "later" slippage risk, and the views are cheap once the tier system exists.
- Add spring-force view — rejected; looks cool but reads badly for DAGs where direction matters.
