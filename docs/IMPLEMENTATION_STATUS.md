# WHITEOUT: Last Signal — Implementation Status

Source of truth: SRS v1.0 (3 November 2026), `WHITEOUT_Last_Signal_SRS_v1.0.docx`.
The concept images are art direction only and are not shipped as assets.

## Fixed decisions (SRS section 1.3)

- Single-player third-person campaign only; first-person, multiplayer,
  accounts, cloud saves and any server are out of scope for v1.0.
- Exactly 30 levels in six stages (Training 1-3, Operations 4-8,
  Combat Zone 9-15, Special Operations 16-22, Final Campaign 23-27,
  Final Showdown 28-30).
- Desktop browsers first (Chrome and Edge primary); WebGL 2 baseline,
  WebGPU only as a feature-detected enhancement.
- Stack: PlayCanvas Engine npm package `playcanvas` (no Three.js /
  Babylon / Phaser substitution), TypeScript strict, Vite, `dist/` output.
- UI in HTML/CSS/DOM + TypeScript; no React in v1.0.
- Persistence: IndexedDB, small preferences in localStorage; no backend.
- Hosting: static Vercel deployment from GitHub; gameplay runs locally.

## Architecture (SRS sections 4-5)

- Composition root (`src/app/bootstrap.ts`, `GameRuntime.ts`) creates the
  PlayCanvas app, shared services and systems, then injects only what each
  system needs. Systems depend on interfaces and shared domain types, never
  on another system's internals; no circular imports between systems A-F.
- Typed `EventBus` with immutable snapshot payloads
  (`src/core/EventBus.ts`, `GameTypes.ts`): `weapon.fired`,
  `combat.hitConfirmed`, `entity.died`, `player.healthChanged`,
  `player.ammoChanged`, `objective.progressChanged`, `mission.stateChanged`,
  `checkpoint.activated`, `settings.audioChanged`, plus `app.stateChanged`
  and `app.error` for the runtime itself.
- `GameStateMachine` enforces the SRS section 4.2 transitions:
  Boot -> MainMenu/Error, MainMenu -> Loading, Loading -> Briefing/Playing/
  MainMenu, Briefing -> Playing/MainMenu, Playing -> Paused/Victory/Defeat,
  Paused -> Playing/MainMenu, Victory/Defeat -> MainMenu/Loading,
  Error -> MainMenu/Boot. Settings is an overlay, not a state.
- `Clock` bounds render delta time (max 1/20 s) and advances simulation in
  fixed 1/60 s steps, capped at 5 steps per frame.
- `SaveRepository` validates every read (schemaVersion 1) and falls back
  safely to defaults; IndexedDB first, localStorage second, in-memory
  third, so a storage failure never crashes the game (NFR-12).

## Build gates (SRS section 11) — mandatory order

| Build | Focus                           | Status                                                                                    |
| ----- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| 0     | Repository + foundation         | Done 2026-11-03 — gate fully green, local commit 53fea04, awaiting GitHub repo to push to |
| 1     | Player vertical slice           | Done 2026-11-03 — gate fully green, see Build 1 report below                              |
| 2     | Weapons + combat                | Done 2026-11-03 — gate fully green, see Build 2 report below                              |
| 3     | Enemy AI                        | Not started                                                                               |
| 4     | Effects + sound + UI            | Not started (UI shell only in Build 0)                                                    |
| 5     | Mission framework + Levels 1-10 | Not started                                                                               |
| 6     | Levels 11-20                    | Not started                                                                               |
| 7     | Levels 21-30                    | Not started                                                                               |
| 8     | Polish, QA and release          | Not started                                                                               |

A build is not complete until its gate passes. Do not start the next build
until the current gate passes.

## Build 0 report

- Scaffold: official `npm create playcanvas@latest` (Engine format,
  TypeScript), project `whiteout-last-signal`. The starter's rotating cube
  was removed; the scaffold structure was otherwise kept.
- Added: `src/core/` (EventBus, ServiceContainer, Clock, Logger,
  GameTypes), `src/app/` (bootstrap, GameRuntime, GameStateMachine,
  SystemRegistry), `src/services/SaveRepository.ts`, `src/systems/ui/`
  (menu / loading / error shell only), `src/main.ts` entry, menu shell in
  `index.html` + `src/starter.css`.
- Added: Vitest unit tests (`tests/unit/`), Playwright boot test
  (`tests/e2e/boot.spec.ts`), `vitest.config.ts`, `playwright.config.ts`,
  explicit scripts (`typecheck`, `test`, `test:e2e`, `build`, `preview`),
  GitHub Actions CI (typecheck -> lint -> unit tests -> build), README,
  LICENSE (MIT, original code), asset license ledger (empty — no assets
  yet, by design).
- Known limitations: no player, arena, weapons, enemies, missions or audio
  yet — that is Builds 1-6, not a Build 0 defect. The Campaign button
  opens the loading shell and returns to the menu honestly instead of
  faking a mission. No production GLB/audio asset is included; the
  realistic-character requirement is therefore explicitly NOT met yet.
- Environment: Node v24.22.1 (SRS requires >= 22.23.2), npm 10.9.4.
- Gate results 2026-11-03: `npm run typecheck` pass, `npm run lint`
  pass, `npm run fmt` pass (after `fmt:fix`), `npm run test` 6/6 Vitest
  pass, `npm run build` pass (dist 1,148 kB JS, 304 kB gzip),
  `npm run test:e2e` 1/1 Playwright pass (menu shell, Settings panel,
  zero console errors), `vite preview` smoke check HTTP 200 with the
  correct title. Local git commit 53fea04 on branch main; no remote yet
  — push waits for the owner-created `whiteout-last-signal` repo.

## Build 1 report

- Added: `src/systems/player/` — `PlayerSystem.ts` (arena, player figure,
  camera rig, health, pause, debug HUD), `InputAdapter.ts` (keyboard /
  mouse, pointer lock), `PlayerAnimation.ts` (blended procedural
  locomotion), `movement.ts` (pure, unit-tested collision / camera /
  yaw / blending helpers). Menu gains a "Test Arena (Build 1)" button.
- Arena: 40 x 40 m floor, four walls, five crates, spawn at (0, 6).
  Movement: camera-relative WASD, sprint (Shift, 7.5 m/s), walk (4.5 m/s),
  crouch (C, 2.2 m/s), jump (Space, gravity 22 m/s^2), axis-separated
  circle-vs-box collision with wall sliding, arena bounds, floor clamp —
  no falling through the floor, no wall penetration.
- Camera: over-the-shoulder (right 0.55 m, eye 1.7 m, distance 4 m),
  yaw/pitch from mouse with the saved sensitivity setting, distance
  sampled inward in 0.25 m steps so it slides along crates/walls instead
  of clipping through them.
- Pause: Esc releases pointer lock and pauses (simulation frozen);
  P also pauses; Resume / Restart arena / Back to menu from the pause
  overlay. Back to menu destroys the arena and restores the menu camera.
- Health: 100 max, debug damage via H (HUD buttons are unreachable in
  pointer lock, so the key is the real debug path) or the HUD button when
  unlocked; damage emits `player.healthChanged`; reaching 0 respawns at
  the spawn point — a placeholder until the Build 5 checkpoint manager.
- GREYBOX PLACEHOLDER, explicit: the figure is boxes and a sphere with
  procedural limb swing and bob. It is NOT a realistic rigged GLB, and
  the SRS animation clips (aim, fire, reload, hit, death) are not met
  yet. No GLB or licensed character asset is in the project.
- Fixes found by testing: the hidden main menu still intercepted clicks
  (`.shell[hidden]` now hides it); HUD buttons are unreachable under
  pointer lock (H key added, e2e test uses the key).
- Gate results 2026-11-03: typecheck pass, lint pass, fmt pass, Vitest
  14/14 (6 core + 8 movement/animation), production build pass
  (dist JS ~1,159 kB / ~308 kB gzip), Playwright 2/2 (boot shell + arena
  open / HUD / debug damage / W movement, zero console errors).

## Build 2 report

- Added: `src/data/weapons.ts` (balance data), `src/services/DamageService.ts`
  (shared damage rules), `src/systems/player/raycast.ts` (pure slab-method
  ray vs box, nearest hit wins), `src/systems/player/WeaponController.ts`
  (magazine, reserve, fire interval, reload, switching), and a minimal
  `src/systems/audio/AudioSystem.ts` (procedural Web Audio gunshot / hit /
  reload sounds, no licensed files; full mixer and positional audio are
  Build 4).
- Weapons: Assault Rifle (auto, 0.10 s, 30 / 120, 2.2 s reload, 25 damage),
  Pistol (semi, 0.25 s, 12 / 60, 1.4 s reload, 20 damage), Shotgun (semi,
  0.80 s, 6 / 30, 2.8 s reload, 6 x 8 damage with spread). Switching with
  1/2/3 cancels a reload and applies a 0.3 s switch lock; reload with R
  is blocked when full or already reloading; an empty magazine starts a
  reload automatically. Fire direction is the true aim direction, and
  the camera now looks exactly along it, so crosshair, ray and camera
  agree (SRS section 2.3).
- Combat targets: five greybox target boards in the arena (50 health each).
  A hit emits `combat.hitConfirmed`, shows a HIT marker, an impact sphere
  and a tracer from the muzzle, and logs the event in the HUD event log;
  a killed target tips over and respawns after 5 s. These are test
  targets, not enemies — enemy AI, perception and death behaviour are
  Build 3, and targets deliberately do not emit `entity.died`.
- Fixes found by testing: a quick mouse click could start and end between
  two frames and be lost for auto weapons, so a press now fires once via
  a click edge as well as while held; the menu/pause entry clicks are
  discarded so they never fire a shot.
- Gate results 2026-11-03: typecheck pass, lint pass, fmt pass, Vitest
  20/20 (core, movement, damage, raycast, weapon controller), production
  build pass (dist JS ~1,171 kB / ~312 kB gzip), Playwright 2/2 (boot +
  arena open / W movement / rifle fire / ammo 30 -> 29 / "Hit target-1
  for 25", zero console errors).
- Push status: the repo the owner created is
  `AbdurRahmanKhan000/WHITE-OUT-LAST-SIGNAL` (public, empty, default
  branch main — not the assumed `whiteout-last-signal` name), but the
  snapshot push failed with 403 "Resource not accessible by
  integration": the Muse GitHub App has not been granted access to this
  repo. The owner must select this repo in the install card before a
  push can succeed. Builds 0-2 therefore remain local only for now.
- Next build recommendation: Build 3 (enemy character rig, patrol
  waypoints, perception, FSM, attack, reload, cover/reposition, damage
  and death).

## Traceability (Build 0)

| Requirement                                   | Module                             | Evidence                                   |
| --------------------------------------------- | ---------------------------------- | ------------------------------------------ |
| FR-01 boot / error shell                      | `bootstrap.ts`, `UISystem.ts`      | Playwright boot test, error overlay        |
| FR-02 main menu navigation                    | `UISystem.ts`, `index.html`        | Playwright boot test                       |
| FR-22 settings (partial: shell + persistence) | `UISystem.ts`, `SaveRepository.ts` | Unit test, settings panel                  |
| FR-20 local save, versioned                   | `SaveRepository.ts`                | Unit test                                  |
| NFR-06 architecture / no circular imports     | `src/app/`, `src/core/`            | TypeScript strict check                    |
| NFR-07 strict TS, lint, tests before merge    | CI workflow                        | GitHub Actions                             |
| NFR-11 no secrets in bundle                   | —                                  | No credentials in repo; verify in CI build |
