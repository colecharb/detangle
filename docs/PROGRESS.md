# Progress

Living status file. Update when finishing a phase, or when anything meaningful changes.

## Status

| Phase | State | Notes |
|---|---|---|
| 0 — Scaffolding | complete (2026-04-19) | Expo SDK 54 (SDK 55 not yet released) |
| 1 — Auth & Sync | not started | |
| 2 — Graph Canvas + Tier 2 | not started | |
| 3 — Semantic Zoom | not started | |
| 4 — Other Views | not started | |
| 5 — Filter-first UX | not started | |
| 6 — Polish | not started | |
| 7 — Ship | not started | |

## Changelog

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

_(nothing yet)_
