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
| 3     | Enemy AI                        | Done 2026-11-03 — gate fully green, see Build 3 report below                              |
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
- Next build recommendation: Build 4 (effects + sound + UI: full mixer and
  positional audio, muzzle/impact polish, HUD work beyond the shell).

## Build 3 report

- Added: `src/data/enemies.ts` (grunt balance data, difficulty scale
  table, arena waypoints / crates / spawns), `src/systems/enemy/` —
  `Perception.ts` (distance, FOV, line of sight, sound), `NavigationGraph.ts`
  (A\* over the authored waypoint graph), `EnemyStateMachine.ts` (explicit
  FSM), `EnemyBrain.ts` (pure per-enemy runtime: state, timers, ammo,
  path, steering), `EnemySystem.ts` (PlayCanvas figures, bus adapter,
  HUD counts). `src/systems/player/raycast.ts` moved to
  `src/services/raycast.ts` (same API) so perception and enemy fire share
  one slab implementation; no system imports another system's internals.
- Enemies: exactly 3 grunts in the test arena (health 100, patrol 1.6 m/s,
  chase 3.2 m/s, perception 20 m / 100 degrees, attack range 12 m, fire
  0.8 s, damage 8, magazine 12, reload 2.0 s, reaction 0.4 s, investigate
  3 s, stun 0.4 s, sound range 20 m) at (-16, -16), (16, -16) and (0, -14),
  starting in Patrol on the arena loop. Patrol facing is the arena
  centre: a sentry that only looked where it walked would take a full
  loop to notice a player near the centre.
- Perception is strictly less-than range: the (0, -14) enemy sits exactly
  20 m from the spawn (0, 6), so a stationary player is not detected —
  this protects the existing arena e2e test. Detection also needs FOV
  and a clear eye-to-chest line of sight (a low crate does not block a
  ray passing over it). A player gunshot within 20 m sends patrolling
  enemies to Investigate toward the shot origin.
- FSM: Idle -> Patrol -> Investigate -> Alert -> Chase -> Attack ->
  TakeCover -> Stunned -> Dead, with every transition through one
  function. Reposition (SRS "cover/reposition") is realised as
  Investigate moving over the graph toward the last known position, not
  as a separate state — that is the behaviour the Build 3 design
  specifies. TakeCover triggers once per life below 40% health, moving
  to the nearest cover waypoint beside a crate, then resumes Attack.
  A non-lethal hit stuns (0.4 s, then resumes the previous state);
  death tips the figure over and emits `entity.died` (entityType
  `enemy`). Enemy reload refills from an untracked supply (reserve
  reported 0); magazine, cooldown and reload block firing exactly as
  for the player.
- Navigation: A\* over 12 authored waypoints (8 loop + 4 cover) with
  edges validated against crate boxes expanded by 0.5 m; unreachable
  goals return an empty path, never a loop. Path recomputation is
  throttled to 0.5 s per enemy (NFR-14). Chase normally moves directly
  at the player; see "Fixes found by testing" for the blocked case.
- Wiring (SRS section 5): bootstrap constructs one PlayerSystem and one
  EnemySystem and registers both in the ServiceContainer before any
  system initialises. PlayerSystem obtains the enemy system via
  `services.get` in a try/catch and uses only its `getEnemyTargets()`
  interface for raycast targets; it never damages enemies locally —
  enemy hits only emit `combat.hitConfirmed`, and EnemySystem applies
  them through the brain (DamageService). EnemySystem reads the player
  only through PlayerSystem's `getPlayerSnapshot()` (null when there is
  no arena). Enemies spawn only while state is `playing` with a player
  snapshot, are destroyed on transition to `mainMenu` (pause does not
  destroy them), and reset on the new `arena.restarted` event. Enemy
  shots emit `weapon.fired` (ownerId = enemy id, weaponId
  `enemy-rifle`) and, on a geometric raycast hit, `combat.hitConfirmed`
  with targetId `player`, which PlayerSystem turns into damage through
  its existing private damage() — that is how enemies damage the player.
- GREYBOX PLACEHOLDER, explicit: enemy figures are boxes and a sphere
  with arms posed forward, like the Build 1 player figure. They are NOT
  realistic rigged GLBs, and no SRS animation clips are met by Build 3.
  There is no mission system yet — that is Build 5.
- Fixes found by testing: (1) Graph dead-end at crate faces: an enemy
  stopped against a crate has its centre (0.45 m radius) inside the
  0.5 m expanded crate box, so a slab edge test rejected every path
  from it. Start edges now use sampling from 0.25 m onward, which lets
  an enemy leave the box it touches while still rejecting segments
  that pass through a box. (2) Chase stall at the centre crate: an
  enemy chasing across the crate face used to fall back to a 35-54 m
  loop-graph detour while the player stood 15 m away. The brain now
  sidesteps first — nearest expanded crate corner with a sampled-clear
  segment — then resumes direct chase; graph repath is the fallback,
  and standing still is the last resort, per the "stop when blocked"
  rule. (3) E2E timing in this environment: the VM renders WebGL at
  ~4 fps and the 0.05 s delta clamp caps game time near 0.2 s per wall
  second, so 2.5 s of wall-clock W is only ~0.4 s of game time and the
  first hit landed ~27 s after the walk. The spec now holds W for
  10 s of wall clock (walking the player within attack range of the
  crate face, so the first hit depends on the short chase, not the long
  path) and allows 60 s for the health drop. Assertions are unchanged
  (Chase/Attack text AND health below 100); only waits changed.
  (4) Pointer-lock aim jump, found in independent verification after
  the Build 3 commit: a click dispatched while pointer-locked
  generates synthetic mousemove events jumping ~640 px in one event,
  which the game applied as an ~80 degree aim spin, so the arena test's
  rifle shot missed the board. Fixed in `InputAdapter.ts`: the first
  move after lock acquisition is discarded, and any single mousemove
  event over 250 px is ignored as a teleport artifact (a real flick
  never arrives as one 640 px event). The arena test now also fires
  with down/up instead of a click (in pointer lock only movement
  matters, not position) and fires until a hit is logged, because the
  rifle's random spread means one shot at the board's edge is not
  guaranteed to hit — the assertion itself is unchanged.
- Gate results 2026-11-03: typecheck pass, lint pass, fmt pass, Vitest
  45/45 (20 existing + 25 enemy: perception, FSM, navigation, brain,
  multi-brain 1/3/8), production build pass (dist JS 1,193 kB /
  317 kB gzip), Playwright 3/3 (boot + arena unchanged + enemies, zero
  console errors), enemies.spec passed 3 consecutive runs of the final
  spec (plus two extra confirming runs), `vite preview` smoke check
  HTTP 200 with the correct title. Local commit only — no GitHub push
  was attempted in this build, per the task; the owner pushes manually.
- Next build recommendation: Build 4 (effects + sound + UI).

## Build 4 report

- Scope (SRS section 11, Build 4): effects + sound + UI, in the test
  arena. Missions still arrive in Build 5; nothing in this build
  claims a mission, a realistic character, or licensed assets.
- Graphics (`src/systems/graphics/`): a new `GraphicsSystem` owns a
  pooled `EffectPool` (fixed set of small box/sphere entities, capped
  per preset, so a firefight cannot accumulate unbounded temporary
  entities). Every confirmed hit spawns a debris burst; every enemy
  death spawns an explosion burst plus rising smoke. Muzzle flash,
  tracer and the single impact sphere from Build 2 stay in
  `PlayerSystem` — this system adds the pooled layer, it does not
  move weapon feedback. Quality presets are real runtime settings
  (`quality.ts`, pure and unit-tested): Low caps pixel ratio at 1,
  disables shadow casting and caps effects at 12; Medium 1.5 / shadows
  on / 24; High 2 / shadows on at 2048 / 48. Changing the settings
  quality applies the preset live via a new `settings.changed`
  event, and the same event lets sensitivity apply live in
  `PlayerSystem` (previously it was only read at startup).
- Sound (`src/systems/audio/`): the mixer follows the settings
  sliders live (master / music / SFX / mute). Gunfire, hits and
  explosions are positional (`positional.ts`, pure and unit-tested):
  volume attenuates with distance from the camera and pan follows
  world X offset. Pan is world-relative, not head-relative — the
  listener's facing is not tracked, so a sound behind the player
  pans the same as one in front at the same X offset; that limit is
  documented in the code, not hidden. New sounds, all procedural Web
  Audio, no licensed files shipped: enemy detection alert (two-tone),
  hurt thud for player damage, explosion (low-passed noise), victory
  arpeggio on arena clear, and a low ambient loop that starts when
  play begins (after the arena button click, so autoplay rules are
  satisfied) and suspends on pause/menu. The full positional model
  (head-relative pan, occlusion, reverb) is Build 8 polish.
- UI (`UISystem.ts`, `arenaStats.ts`): HUD objective ("Eliminate all
  3 enemies — N remaining", updated on each enemy death), a red
  damage flash held 2 s on player damage, and a results shell that
  appears when all 3 arena enemies are dead (kills, shots, hits,
  accuracy capped at 100 so shotgun pellets cannot report over 100%,
  time), with Restart arena and Back to menu buttons wired to the
  existing arena actions. The enemy total (3) is the test-arena
  constant; Build 5 replaces it with mission data. Settings sliders
  were already persisted in Build 0; Build 4 proves it in e2e
  (master 0.5 and quality Low survive a reload).
- Events added (`GameTypes.ts`): `settings.changed` (full Settings),
  `enemy.detected` (emitted on the first transition to Alert per
  enemy life, logged in the event log and sounded as an alert), and
  `arena.cleared` (results summary, sounded as a victory arpeggio).
- Honest limits: effects are pooled mesh bursts, not GPU particle
  textures — no particle asset is shipped. Figures are still
  greybox; this build improves feedback and UI, it does not make
  boxes into the realistic soldier of the concept images. That
  remains an asset decision, raised with the owner on 2026-11-03
  after the live Build 3 deployment, who chose to continue Build 4
  as planned.
- Test environment note: the full e2e suite fails when run in
  parallel on this VM (software WebGL, ~4 fps): arena timed out on a
  mouse action, the damage flash faded before the slow HUD check,
  and the enemies health drop exceeded 60 s. Each spec passes
  individually, and the full suite passes 4/4 when run serially
  (`--workers=1`, 1.8 m). The gate below is the serial run; parallel
  failure here is a VM capacity limit, not a game regression.
- Gate results 2026-11-03: typecheck pass, lint pass, fmt pass,
  Vitest 54/54 (45 existing + 9 Build 4: quality profiles,
  positional gain, arena stats), production build pass (dist JS
  1,202 kB / 320 kB gzip), Playwright 4/4 serial (boot + arena +
  build4 + enemies, zero console errors), `vite preview` smoke check
  HTTP 200. Local commit only — no GitHub push was attempted in
  this build; the owner pushes manually via ZIP, as before.
- Next build recommendation: Build 5 (Levels 1–10).

## Build 5 report

- Scope (SRS section 11, Build 5; FR-15/16/17/18/19/20/21/24): mission
  framework plus Levels 1–10 playable in sequence, with reload
  persistence, retry and checkpoints, and no level leaks (systems
  unsubscribe and scene entities are destroyed on level unload —
  mission mode reuses the existing arena destroy path, and
  EnemySystem clears its mission plan on leaving to the menu).
- Data (`src/data/levels.ts`, SRS section 12.1): one record per level
  (id, name, stage, difficulty, environmentId, playerSpawn,
  enemySpawnGroups, objectives, checkpointDefinitions, musicCue,
  completionRules, nextLevelId, plus rifleReserve and environment
  tint). Records are validated on load and fail clearly naming the
  missing or out-of-range field. The catalog lists all 30 SRS missions
  (names, stages, environments from SRS section 8.1); levels 11–30 are
  locked summaries ("Coming in Build 6/7"), never faked as playable.
- Reused geometry, stated plainly: every Build 5 level runs in the
  test-arena geometry (40x40 m, same crates/walls/waypoint graph).
  Levels differ in player spawn, enemy groups, objective zones
  (visible flat marker boxes), time limits, ammo reserve (Level 9:
  rifle reserve 60 instead of 120) and environment tint (camera clear
  colour + light intensity per environment). No 10 separate maps were
  built, and figures remain greybox — no realistic character or
  licensed asset is claimed.
- Architecture: `src/systems/mission/` holds `MissionSystem.ts`
  (campaign flow), `MissionCatalog.ts` (catalog access: re-exports the
  validated 30-entry list from `src/data/levels.ts` plus stage
  grouping), `ObjectiveManager.ts` (pure, sequential objectives),
  `WaveSpawner.ts` (pure, wave-on-full-clear, exactly once),
  `CheckpointManager.ts` (pure) and `score.ts` (pure). Wiring is the
  typed EventBus plus the established service-interface snapshot reads
  (player snapshot, save repository) already used by EnemySystem.
  MissionSystem never builds geometry and never damages enemies:
  `mission.started` carries the spawn plan, zones and tint, and
  PlayerSystem builds the mission arena from it while EnemySystem
  spawns the plan groups.
- Objective types: eliminate (per group or all), activate (continuous
  3 s dwell; leaving resets the dwell), reach (enter the zone),
  survive (timer), defend (dwell then a hold timer that runs
  regardless of position — a documented simplification, proximity is
  not re-checked during the hold). Objectives run in order; only the
  first incomplete objective is active. Time limits fail the mission
  when they expire (Level 3's 120 s extraction window).
- Waves: a wave group spawns when its `waveAfter` group is fully
  cleared (Level 4's second perimeter group, Level 6/8/10 waves).
  Level 1's sentries use a single-point patrol route (their own spawn)
  so they stand still until they detect the player — an empty route
  would divide by zero in the brain's patrol index, so it is never
  used.
- Checkpoint rule, exactly as implemented: level start is a
  checkpoint; each completed objective creates a checkpoint at the
  player's position. "Retry from checkpoint" restores that position
  with full health and full ammo, keeps completed objectives and the
  kill count at checkpoint time, and respawns every group except
  those tied to a completed eliminate objective at full strength.
  Kills on a respawned group after the retry count as new encounters.
  Partial progress on the current objective is lost on retry, and a
  time limit restarts from the retry. No full enemy-state snapshot is
  kept, by design.
- Score/rank (`score.ts`): score = kills * 100 + round(accuracy) * 2
    - max(0, parSeconds - timeSeconds) * 5 - damageReceived, floored at
      0; accuracy is hits/shots capped at 100; rank S >= 1000, A >= 700,
      B >= 400, otherwise C. Unlock: completing a level unlocks only the
      next level id (a single frontier). Best results are saved once per
      level (only a higher score replaces the stored best), and reload
      preserves progress through the existing SaveRepository.
- Save migration (`normalizeSave` in SaveRepository): a corrupt or
  missing record falls back to the default save; a well-formed record
  is sanitised (unlock frontier clamped 1..31, malformed best entries
  dropped, malformed settings replaced by defaults), so one bad entry
  never wipes valid progress.
- Mission vs arena behaviour, kept separate on purpose: mission mode
  has no target boards, death is defeat (not respawn), and pause
  Restart is a full mission restart. The test arena is byte-for-byte
  unchanged in behaviour (boards, respawn, arena results shell, all
  existing assertions). UISystem's arena stats are gated off during
  missions so the arena results shell can never pop inside a mission.
- UI polish (Build 5, on top of the mission work, per the owner's
  additional instruction): one dark theme with a single accent
  (#e11d48) and consistent button/hover/focus/transition styling
  across menu, campaign, briefing, pause, victory/defeat, results and
  settings. Campaign list is stage-grouped level cards with difficulty
  badges, locked/unlocked states and best-result lines. Briefing shows
  objectives, environment, threat summary (enemy/group counts, ammo
  note) and a prominent Deploy button. HUD is modern-shooter layout:
  health bottom-left, ammo bottom-right, objective tracker top,
  styled event feed, hitmarker, damage vignette, plus a low-health
  pulse at or below 30 HP (presentation only, no rule change).
  Campaign-mission HUD is clean: the debug button, greybox note and
  debug coordinates are hidden in mission mode only (a CSS class set
  by PlayerSystem), while the test arena keeps its debug HUD exactly.
  Briefing is a menu panel, not a runtime state — the same convention
  as Settings being an overlay rather than a state.
- Deliberately NOT done: no radar/minimap. The SRS allows radar only
  if it improves navigation, and a faked minimap would not; it is
  omitted rather than faked. No distinct music cues per level yet:
  `musicCue` is stored in the level record but the ambient loop is
  still generic (Build 8 polish). Weapon-switching is available in
  Level 2 but is not a tracked objective (no switch event exists to
  count it honestly).
- Test environment note: as in Build 4, the full suite must run
  serially (`--workers=1`) on this VM; parallel runs time out on
  software WebGL. The gate below is the serial run.
- Gate results 2026-11-03: typecheck pass, lint pass (after one
  `lint:fix` for import order in UISystem.ts), fmt pass, Vitest 70/70
  (54 existing + 16 Build 5: catalog validation, objectives, waves,
  checkpoints, score/rank/unlock, save migration), production build
  pass (dist JS 1,235.60 kB / 328.01 kB gzip), Playwright serial 7/7
  (boot, arena, build4, enemies, mission campaign/briefing/HUD,
  mission Level 1 completes, mission defeat/retry — zero console
  errors in every spec; the Level 1 victory test also passed three
  consecutive standalone runs, 2.1/1.3/1.7 min, and 1.2 min inside
  the final suite run), `vite preview` smoke check HTTP 200. Honest
  flakiness note: one earlier serial suite run failed the pre-existing
  arena spec on a missed board shot under VM load; it passed alone
  (25 s) and on the full re-run, so it is load flakiness in that
  test's single-shot loop, not a Build 5 regression — Build 5 does
  not touch arena firing, target boards, or InputAdapter. Local
  commit only — no GitHub push was attempted in this build; the
  parent handles delivery. No ZIP is delivered by this build.
- Next build recommendation: Build 6 (Levels 11–20).

## Build 6 report

- Scope (SRS section 11, Build 6): Levels 11-20 playable in sequence
  after Level 10, with difficulty increasing over Levels 1-10.
  Levels 21-30 stay locked summaries ("Coming in Build 7"), never
  faked as playable.
- Levels (src/data/levels.ts, same validated schema as Build 5):
  11 Frozen Entry (eliminate two groups), 12 Whiteout Patrol
  (eliminate two scout patrols, reduced visibility), 13 Cold Storage
  (activate generator, defend 45 s), 14 Convoy Intercept (stationary
  roadblock, then scout escorts), 15 Last Outpost (defend 60 s with
  escalating waves ending in heavies), 16 Black Facility (two
  security terminals), 17 Power Core (reach, then deactivate), 18
  Personnel Recovery (reach the stranded operative), 19 Data Vault
  (defend 45 s against heavy reinforcements), 20 Underground Exit
  (three sequential groups, then reach the surface). Stages:
  11-15 Combat Zone/Hard, 16-20 Special Operations/Very Hard.
- New enemy variants (src/data/enemies.ts, data only — brain,
  perception and combat rules unchanged, difficulty scaling still
  applies on top): Heavy (200 HP, 12 damage, chase 2.4 m/s, figure
  scale 1.25) and Scout (70 HP, 6 damage, chase 4.2 m/s, perception
  24 m, figure scale 0.9). Groups carry an optional variant; the
  test arena still spawns grunts only.
- Reduced visibility (Level 12, documented honestly): a darker
  snow tint plus a 0.6 perception multiplier applied to enemy
  definitions for that level (mission.started payload, reset on
  mainMenu). No weather system is claimed.
- Defend escalation (WaveSpawner.triggerNextWave + MissionSystem):
  when a defend objective's hold phase starts, the HUD switches to
  the hold label (new optional defendLabel) and the next wave spawns,
  so defend missions escalate even if the player ignored the guards
  instead of clearing them. This also improves the Build 5 Level 10
  defend mission; no Build 5 test asserted the old behaviour.
- Level 13 design note: the player spawns on the edge of the
  generator zone (size 8), so activation dwells from spawn instead
  of requiring a walk through a small zone that would reset the
  dwell timer on leaving.
- Level 18 honesty: the stranded friendly NPC is an extraction
  marker zone, not a companion AI — no NPC behaviour is faked.
- UI fixes (Build 5 hard-codes removed): Continue, Next-mission and
  victory Next buttons now follow the playable catalog via
  findLevel instead of a `<= 10` cap, and the victory screen says
  "More missions arrive in Build 7" when there is no next playable
  level. The modern Build 5 UI (dark theme, accent, level cards,
  briefing, clean campaign HUD) is unchanged otherwise.
- Reused geometry, stated plainly: all Build 6 levels run in the
  test-arena geometry with snow/facility/tunnel tints, different
  spawns, groups, zones, timers and variants — not separate 3D maps.
  Figures remain greybox.
- Tests updated for the new frontier: the Build 5 unit test and
  e2e assertion that Level 11 was unplayable now assert Level 21
  is the unbuilt frontier instead.
- Gate results 2026-11-04: typecheck pass, lint pass (after one
  import-order fix in build6.test.ts), fmt pass, Vitest 82/82 (70
  existing + 12 Build 6: variant balance, wave escalation, unlock
  chain 10-20, catalog validation, save migration), production build
  pass (dist JS 1,246.65 kB / 329.67 kB gzip), Playwright serial
  11/11 (boot, arena, build4, build6 x4, enemies, mission x3 —
  zero console errors; full suite 5.2 m), `vite preview` smoke check
  HTTP 200. Local commit only — no GitHub push was attempted in
  this build; the parent handles delivery. No ZIP is delivered by
  this build.
- Next build recommendation: Build 7 (Levels 21-30).

## Traceability (Build 0)

| Requirement                                                                                           | Module                                                                    | Evidence                                                                                             |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| FR-01 boot / error shell                                                                              | `bootstrap.ts`, `UISystem.ts`                                             | Playwright boot test, error overlay                                                                  |
| FR-02 main menu navigation                                                                            | `UISystem.ts`, `index.html`                                               | Playwright boot test                                                                                 |
| FR-22 settings (partial: shell + persistence)                                                         | `UISystem.ts`, `SaveRepository.ts`                                        | Unit test, settings panel                                                                            |
| FR-20 local save, versioned                                                                           | `SaveRepository.ts`                                                       | Unit test                                                                                            |
| NFR-06 architecture / no circular imports                                                             | `src/app/`, `src/core/`                                                   | TypeScript strict check                                                                              |
| NFR-07 strict TS, lint, tests before merge                                                            | CI workflow                                                               | GitHub Actions                                                                                       |
| NFR-11 no secrets in bundle                                                                           | —                                                                         | No credentials in repo; verify in CI build                                                           |
| FR-09 enemies detect via distance/FOV/LOS                                                             | `Perception.ts`, `EnemyBrain.ts`                                          | Unit perception tests (range, FOV, blocked LOS, boundary), e2e enemies.spec                          |
| FR-10 explicit AI states (patrol, investigate, alert, chase, attack, cover/reposition, stunned, dead) | `EnemyStateMachine.ts`, `EnemyBrain.ts`                                   | FSM unit tests, brain stun/cover tests, HUD state counts                                             |
| FR-11 authored paths, avoid obstacles/loops                                                           | `NavigationGraph.ts`, `EnemyBrain.ts` (sidestep)                          | A* unit tests (around crate, no repeats, unreachable empty, crate-face regression), e2e enemies.spec |
| FR-12 fire, reload, damage, death on shared rules                                                     | `EnemyBrain.ts` (DamageService), `EnemySystem.ts`                         | Unit fire/reload/stun/lethal tests, e2e enemies.spec (health drop)                                   |
| NFR-14 path recomputation throttled                                                                   | `EnemyBrain.ts` (0.5 s path timer)                                        | Code + unit brain tests                                                                              |
| FR-15 mission objectives (eliminate/activate/reach/survive/defend)                                    | `ObjectiveManager.ts`, `MissionSystem.ts`                                 | Unit objective tests, e2e mission.spec (Level 1 completion)                                          |
| FR-16 checkpoints and retry                                                                           | `CheckpointManager.ts`, `MissionSystem.ts`                                | Unit checkpoint tests, e2e mission.spec (defeat → retry from checkpoint)                             |
| FR-17 enemy waves                                                                                     | `WaveSpawner.ts`, `EnemySystem.ts`                                        | Unit wave tests, Level 4/6/8/10 wave groups in level data                                            |
| FR-18 level unlocks (next level only)                                                                 | `score.ts` (nextUnlockedLevel), `MissionSystem.ts`                        | Unit unlock tests, e2e campaign list locked states                                                   |
| FR-19 local save, best result once                                                                    | `SaveRepository.ts` (normalizeSave), `MissionSystem.ts`                   | Unit save migration tests                                                                            |
| FR-20 score/rank                                                                                      | `score.ts`                                                                | Unit score/rank tests, mission victory screen                                                        |
| FR-21 campaign UI (list, briefing, results)                                                           | `UISystem.ts`, `MissionCatalog.ts`, `starter.css`                         | e2e mission.spec (campaign/briefing/results screens)                                                 |
| FR-24 no level leaks on unload                                                                        | `PlayerSystem.ts` (destroyArena), `EnemySystem.ts` (plan cleared on menu) | Serial e2e suite passes across arena + mission specs                                                 |
| FR-17 campaign 30 missions, stage grouping (Build 6: 1-20 playable)                                   | `levels.ts`, `MissionCatalog.ts`                                          | Unit catalog tests, e2e build6.spec (11/20 unlockable, 21 locked)                                    |
| FR-15/16 defend/activate/reach objectives, escalating waves (Build 6)                                 | `WaveSpawner.ts` (triggerNextWave), `MissionSystem.ts` (defend phase)     | Unit wave tests, e2e build6.spec (Level 13 defend phase)                                             |
| Enemy variants heavy/scout (Build 6)                                                                  | `enemies.ts`, `EnemySystem.ts` (variant + figure scale)                   | Unit variant balance tests                                                                           |
| Level 12 reduced visibility (Build 6)                                                                 | `levels.ts` (perceptionMultiplier), `EnemySystem.ts`                      | Unit validation tests, Level 12 record                                                               |
