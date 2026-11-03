# WHITEOUT: Last Signal

A single-player, third-person 3D action shooter for the web. Campaign: 30
levels in six stages, built with the PlayCanvas Engine (`playcanvas` npm
package), TypeScript and Vite. No backend, no login, no multiplayer in
version 1.0 — Vercel serves static files and gameplay runs locally in the
browser. Saves are local only (IndexedDB, with a localStorage / in-memory
fallback).

The full implementation contract is `WHITEOUT_Last_Signal_SRS_v1.0.docx`
(SRS v1.0, 3 November 2026). The generated concept images are art direction
only and are **not** shipped as game assets.

## Prerequisites

Node.js 22.23.2 or later, npm.

## Getting started

```bash
npm install
npm run dev
```

The app opens at <http://localhost:5173>.

## Scripts

| Script      | Description                                  |
| ----------- | -------------------------------------------- |
| `dev`       | Vite dev server (opens the browser)          |
| `build`     | Production build into `dist/`                |
| `preview`   | Serve the production build locally           |
| `start`     | Preview the production build (opens browser) |
| `typecheck` | TypeScript strict check                      |
| `lint`      | ESLint                                       |
| `fmt`       | Prettier check (`fmt:fix` applies it)        |
| `test`      | Vitest unit tests                            |
| `test:e2e`  | Playwright browser tests (Chromium)          |

Current status: Build 1 done. Each build's acceptance gate is
`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` and
`npm run test:e2e` all passing, plus a browser check with no console
errors. Try it: `npm run dev`, then "Test Arena (Build 1)" in the menu.

## Controls (target mapping, SRS section 2.2)

W/A/S/D move, mouse aims, left mouse fires, right mouse aims, R reloads,
1/2/3 switch weapons, Shift sprints, Space jumps, C crouches, Esc pauses.
Movement, camera, collision, health and pause work in the Build 1 test
arena; three weapons, raycast combat against target boards, and
procedural weapon sounds work in Build 2; enemy AI arrives in Build 3.

## Project layout (SRS section 12)

- `src/app/` — `bootstrap.ts`, `GameRuntime.ts`, `GameStateMachine.ts`,
  `SystemRegistry.ts`
- `src/core/` — `EventBus.ts`, `ServiceContainer.ts`, `Clock.ts`,
  `Logger.ts`, `GameTypes.ts`
- `src/systems/` — one folder per game system (A-F); so far the UI shell
  and the Build 1 player system (greybox figure, not a final character)
- `src/services/` — `SaveRepository.ts` (IndexedDB / localStorage)
- `src/data/`, `public/assets/` — mission, weapon, enemy and balance data
  and assets (from Build 1 onward)
- `tests/unit/`, `tests/e2e/` — Vitest and Playwright tests
- `docs/` — `IMPLEMENTATION_STATUS.md`, build reports, asset licenses

## Deployment

Static Vercel deployment: framework preset Vite, build command
`npm run build`, output directory `dist`. See SRS section 15.

## Asset licensing

No production character, animation, music or sound asset is included
through Build 1. Every asset added later must be recorded in
`docs/asset-licenses/ASSET_LEDGER.md` with creator, source, license and
allowed use before it ships.
