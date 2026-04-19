# Decisions

Running log of significant decisions. Append new ones at the top.

Format: `## YYYY-MM-DD — Title` / Decision / Rationale / Alternatives considered.

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

## 2026-04-19 — GitHub OAuth device flow, not web flow or PAT

**Decision:** Auth uses GitHub's OAuth device flow exclusively.

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
