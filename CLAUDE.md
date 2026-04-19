# CLAUDE.md

Persistent context for this repo. Read every session.

## What this project is

A GitHub repo graph viewer — universal Expo app (web + iOS + Android from one codebase) with a semantic-zoom UI for exploring commit history. Zero backend, privacy-first, personal-scale tool.

## Before writing any code

1. Read `docs/ROADMAP.md` to know the current phase and acceptance criteria.
2. Read `docs/ARCHITECTURE.md` for stack, folder layout, and invariants.
3. Read `docs/DECISIONS.md` to avoid reintroducing rejected approaches.
4. Read `docs/PROGRESS.md` to know what's actually done vs. planned.
5. Check `docs/CORE_API.md` before touching `/core` interfaces.

## Non-negotiable rules

- **`/core` is pure TypeScript.** No React Native imports. No DOM imports. No Expo imports. Must run in Node with nothing but `fetch` and the `@platform/*` adapters. If you need a platform API in `/core`, add it to the platform adapter interface and call through it.
- **No backend.** No servers, no Supabase, no edge functions, no serverless. Everything runs on the user's device. If a feature seems to require a backend, flag it in `DECISIONS.md` and stop — don't silently add one.
- **GitHub token never leaves the device.** Not to logging services, not to analytics, not to error reporters, not anywhere. Scrub it from any telemetry before it's added.
- **Device flow only for auth.** Never the OAuth web flow (requires a client secret). Never PATs in v1 (device flow is the UX).
- **Expo Router, one codebase.** No separate web app. No Next.js. No conditional rendering that diverges web from native beyond what platform adapters handle.
- **Skia for the graph canvas.** Not SVG, not `<View>` composition. The graph surface is a single `<Canvas>` from `@shopify/react-native-skia`.
- **NativeWind for styling.** Not StyleSheet, not styled-components, not inline styles (except where Skia requires them).

## Workflow rules

- When finishing a phase, update `docs/PROGRESS.md`. Mark the phase complete, note anything deferred, list anything that surprised you.
- When making a meaningful decision not already in `DECISIONS.md`, append to it. Format: date, decision, rationale, alternatives considered.
- When you want to deviate from `ROADMAP.md`, stop and flag it in chat. Don't silently rearrange.
- When `CORE_API.md` needs to change, update it in the same commit as the code change. The doc is the contract.
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).

## Default behaviors

- Use TypeScript strict mode. No `any` without a comment explaining why.
- Prefer readable code over clever code. This is a personal tool; maintainability wins over micro-optimization.
- When unsure between two reasonable approaches, pick the simpler one and note it in `DECISIONS.md`.
- Run typecheck and lint before claiming a phase is done.
