# WHITEOUT: Last Signal — v1.0

A single-player, third-person 3D action shooter for the web. The full
campaign is complete: **30 levels in six stages** (Training 1–3,
Operations 4–8, Combat Zone 9–15, Special Operations 16–22, Final
Campaign 23–27, Final Showdown 28–30), built with the PlayCanvas Engine
(`playcanvas` npm package), TypeScript and Vite. No backend, no login,
no multiplayer in version 1.0 — Vercel serves static files and
gameplay runs locally in the browser. Saves are local only (IndexedDB,
with a localStorage / in-memory fallback).

The full implementation contract is `WHITEOUT_Last_Signal_SRS_v1.0.docx`
(SRS v1.0, 3 November 2026). The generated concept images are art
direction only and are **not** shipped as game assets.

## Prerequisites

Node.js 22 or later, npm.

## Getting started

```bash
npm install
npm run dev
```

The app opens at <http://localhost:5173>. From the main menu, choose
**Campaign** to play the 30-level campaign from Level 1, **Continue**
to resume at your furthest unlocked level, or **Test Arena** for the
greybox testing view (player movement, weapons and enemy AI without
mission objectives).

## How to play

Select a mission from the campaign list (locked missions show until
the previous mission is completed), read the briefing, and press
**Deploy**. Complete the objectives shown in the HUD — eliminate
enemies, activate relays and control points, reach extraction markers,
survive timed waves, or defend a position until the hold completes.
Completing a mission unlocks the next one and records your best result
(kills, accuracy, time, damage, score and rank S/A/B/C). If you are
defeated, retry from the last checkpoint (level start, then each
completed objective) or restart the mission. Completing Level 30,
Last Signal, finishes the campaign; all missions stay replayable.

## Controls (SRS section 2.2)

W/A/S/D move, mouse aims, left mouse fires (hold for automatic
weapons), right mouse aims, R reloads, 1/2/3 switch weapons, Shift
sprints, Space jumps, C crouches, Esc pauses. Pointer lock engages
only after a click, as browsers require.

## Settings

From the main menu or the pause screen: master / music / SFX volume
and mute, mouse sensitivity, and graphics quality (Low, Medium, High
— pixel ratio, shadow casting and effect budget change live).
Settings and progress persist locally; a corrupt or missing save
falls back safely to Level 1 with default settings.

## Scripts

| Script      | Description                                                  |
| ----------- | ------------------------------------------------------------ |
| `dev`       | Vite dev server (opens the browser)                          |
| `build`     | Production build into `dist/`                                |
| `preview`   | Serve the production build locally                           |
| `start`     | Preview the production build (opens browser)                 |
| `typecheck` | TypeScript strict check                                      |
| `lint`      | ESLint                                                       |
| `fmt`       | Prettier check (`fmt:fix` applies it)                        |
| `test`      | Vitest unit tests                                            |
| `test:e2e`  | Playwright browser tests (Chromium; run serially, see below) |

Acceptance gate for every build: `npm run typecheck`, `npm run lint`,
`npm run fmt`, `npm run test`, `npm run build` and the browser suite
all passing, plus a preview check with no console errors. Run the
browser suite serially (`npx playwright test --workers=1`): on
machines with software WebGL rendering, parallel workers overload
the renderer and time out — that is a test-machine limit, not a game
regression.

## Project layout (SRS section 12)

- `src/app/` — `bootstrap.ts`, `GameRuntime.ts`, `GameStateMachine.ts`,
  `SystemRegistry.ts`
- `src/core/` — `EventBus.ts`, `ServiceContainer.ts`, `Clock.ts`,
  `Logger.ts`, `GameTypes.ts`
- `src/systems/player/` — movement, camera, weapons, combat
- `src/systems/enemy/` — perception, navigation graph, state machine,
  brain, enemy system (grunt, scout, heavy and commander variants)
- `src/systems/graphics/` — pooled effects, quality profiles
- `src/systems/mission/` — `MissionSystem.ts`, `MissionCatalog.ts`,
  `ObjectiveManager.ts`, `WaveSpawner.ts`, `CheckpointManager.ts`,
  `score.ts`
- `src/systems/ui/` — menu, campaign list, briefing, HUD, results
- `src/systems/audio/` — procedural mixer and positional audio
- `src/services/` — `SaveRepository.ts`, `DamageService.ts`,
  `raycast.ts`
- `src/data/` — `levels.ts` (all 30 levels), `weapons.ts`,
  `enemies.ts`
- `tests/unit/`, `tests/e2e/` — Vitest and Playwright tests
- `docs/` — `IMPLEMENTATION_STATUS.md`, build reports, asset licenses

## Deployment

Static Vercel deployment: framework preset Vite, build command
`npm run build`, output directory `dist`. Push the repository to
GitHub and Vercel deploys automatically. See SRS section 15.

## Honest limitations of v1.0

Read these before judging the release against the concept images:

- **Greybox figures, no licensed assets.** Player and enemies are
  boxes and spheres with procedural swing/bob animation. No rigged
  GLB character, skeletal animation clips, textures, or licensed
  music/sound files are shipped — audio is procedural Web Audio and
  effects are pooled mesh bursts, not GPU particle textures. The
  asset ledger (`docs/asset-licenses/ASSET_LEDGER.md`) is therefore
  still empty by design; any future real asset must be recorded
  there before shipping.
- **Reused arena geometry.** All 30 levels run in the same 40×40 m
  arena geometry. Levels differ in spawn points, enemy groups and
  variants, objective zones, time limits, ammo reserve and
  environment tint — not in maps. Stand-ins are documented in
  `src/data/levels.ts` (for example, Level 18's stranded operative
  is an extraction marker, not companion AI; Level 22's rooftops
  are a reach + eliminate pair, not a rooftop map).
- **No radar, no cutscene.** The HUD objective tracker, event feed
  and damage feedback are the navigation aids; the SRS radar was
  deliberately omitted rather than faked, and there is no
  story cutscene — the campaign ending is the Level 30 victory
  text and the campaign-complete state.
- **Positional audio is world-relative.** Pan follows world X
  offset, not head-relative facing; there is no occlusion or reverb
  model.
- **Browser smoke scope.** The automated suite runs on Chromium
  via Playwright. Chrome and Edge are the SRS primary browsers;
  the owner has played the live build on Chrome, and a final
  Edge/Chrome check on the owner's machine remains the last
  manual verification before calling the release fully proven.
