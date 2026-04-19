# Detangle

A GitHub repo graph viewer with semantic zoom. One Expo codebase, three targets: web, iOS, Android. Zero backend — everything runs on your device, your GitHub token never leaves it.

## Quick start

```sh
npm install
cp .env.example .env
# Fill EXPO_PUBLIC_GITHUB_CLIENT_ID with your GitHub OAuth app's Client ID (device flow)

npx expo start --web        # run on web
npx expo start --ios        # run on iOS simulator
npx expo start --android    # run on Android emulator
```

## Docs

- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased plan and acceptance criteria
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack, folder layout, invariants
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — why we chose what we chose
- [`docs/CORE_API.md`](docs/CORE_API.md) — interface contract for `/core` and `/platform`
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — what's done, what's next
