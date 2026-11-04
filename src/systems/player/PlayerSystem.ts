import type { AppBase, Entity, LightComponent } from 'playcanvas';
import { Entity as PlayEntity } from 'playcanvas';

import type { GameStateMachine } from '../../app/GameStateMachine';
import type { EventBus } from '../../core/EventBus';
import type { GameContext, GameSystem } from '../../core/GameTypes';
import type { MissionStartPayload, ZoneDefinition } from '../../data/levels';
import type { WeaponId } from '../../data/weapons';
import { applyDamage } from '../../services/DamageService';
import { raycastScene } from '../../services/raycast';
import type { Aabb3, Vec3 } from '../../services/raycast';
import type { SaveRepository } from '../../services/SaveRepository';
import type { EnemyTargetProvider } from '../enemy/EnemySystem';

import { InputAdapter } from './InputAdapter';
import {
    ARENA_HALF_SIZE,
    cameraDistance,
    clampHealth,
    forwardFromYaw,
    moveWithCollisions,
    rightFromYaw
} from './movement';
import type { Obstacle } from './movement';
import { PlayerAnimation } from './PlayerAnimation';
import { WeaponController } from './WeaponController';

/**
 * Build 1 — Player vertical slice (SRS section 6-A, Build 1 gate).
 *
 * GREYBOX PLACEHOLDER, stated plainly: the figure below is boxes and a
 * sphere, not a realistic rigged GLB character. The SRS realistic-character
 * requirement is therefore NOT met by Build 1; it needs a licensed, rigged
 * GLB and its animation clips, which are not in the project yet. What Build 1
 * does prove is the slice around that figure: camera-relative movement,
 * over-the-shoulder camera with collision, pointer lock, jump / sprint /
 * crouch, floor and wall collision, blended procedural locomotion, health
 * and a debug HUD, and pause that freezes the simulation.
 */

const PLAYER_RADIUS = 0.45;
const PLAYER_MAX_HEALTH = 100;
const SPAWN = { x: 0, z: 6 };

const CRATES: readonly Obstacle[] = [
    { minX: 5, maxX: 7, minZ: -5, maxZ: -3, top: 1.2 },
    { minX: -9, maxX: -6, minZ: 2, maxZ: 5, top: 2 },
    { minX: -2, maxX: 2, minZ: -10, maxZ: -8, top: 1 },
    { minX: 8, maxX: 11, minZ: 6, maxZ: 9, top: 2.5 },
    { minX: -13, maxX: -11, minZ: -12, maxZ: -9, top: 1.5 }
];

interface CombatTarget {
    readonly id: string;
    readonly group: Entity;
    readonly aabb: Aabb3;
    health: number;
    readonly maxHealth: number;
    alive: boolean;
    respawnTimer: number;
}

const TARGET_SPOTS: readonly { readonly id: string; readonly x: number; readonly z: number }[] = [
    { id: 'target-1', x: 0, z: -6 },
    { id: 'target-2', x: -6, z: -10 },
    { id: 'target-3', x: 6, z: -12 },
    { id: 'target-4', x: -12, z: 0 },
    { id: 'target-5', x: 12, z: -4 }
];

const WALLS: readonly Obstacle[] = [
    { minX: -ARENA_HALF_SIZE, maxX: ARENA_HALF_SIZE, minZ: -20.5, maxZ: -19.5, top: 3 },
    { minX: -ARENA_HALF_SIZE, maxX: ARENA_HALF_SIZE, minZ: 19.5, maxZ: 20.5, top: 3 },
    { minX: -20.5, maxX: -19.5, minZ: -ARENA_HALF_SIZE, maxZ: ARENA_HALF_SIZE, top: 3 },
    { minX: 19.5, maxX: 20.5, minZ: -ARENA_HALF_SIZE, maxZ: ARENA_HALF_SIZE, top: 3 }
];

function boxEntity(name: string, sx: number, sy: number, sz: number, x: number, y: number, z: number): Entity {
    const entity = new PlayEntity(name);
    entity.addComponent('render', { type: 'box' });
    entity.setLocalScale(sx, sy, sz);
    entity.setLocalPosition(x, y, z);
    return entity;
}

export class PlayerSystem implements GameSystem {
    readonly name = 'player';

    private app: AppBase | null = null;
    private eventBus: EventBus | null = null;
    private stateMachine: GameStateMachine | null = null;
    private input: InputAdapter | null = null;
    private weapon: WeaponController | null = null;
    private readonly animation = new PlayerAnimation();
    private readonly cleanups: (() => void)[] = [];
    private targets: CombatTarget[] = [];
    private tracer: Entity | null = null;
    private flash: Entity | null = null;
    private impact: Entity | null = null;
    private tracerTimer = 0;
    private flashTimer = 0;
    private impactTimer = 0;
    private hitmarkerTimer = 0;
    private previousReloadKey = false;
    private previousDigits = new Set<string>();
    // Optional dependency, obtained from the container: the enemy system
    // is the only source of enemy raycast targets, and it is never a hard
    // crash if it is absent (the arena simply has no enemies).
    private enemyTargets: EnemyTargetProvider | null = null;

    private arena: Entity | null = null;
    private playerRoot: Entity | null = null;
    private camera: Entity | null = null;
    private leftLeg: Entity | null = null;
    private rightLeg: Entity | null = null;
    private leftArm: Entity | null = null;
    private rightArm: Entity | null = null;
    private torso: Entity | null = null;

    private yaw = 0;
    private pitch = 0;
    private sensitivity = 1;
    private health = PLAYER_MAX_HEALTH;
    // Build 5 mission mode: set on mission.started, cleared on exit to
    // the menu. In mission mode there are no target boards, death is
    // defeat (not respawn), and pause Restart restarts the mission.
    private missionActive = false;
    private missionLevelId = 0;
    private missionRifleReserve = 120;
    private verticalVelocity = 0;
    private grounded = true;
    private previousPauseKey = false;
    private previousDamageKey = false;
    private hudTimer = 0;
    private smoothedFps = 60;
    private lastCrouchFactor = 0;

    async initialize(context: GameContext): Promise<void> {
        this.eventBus = context.eventBus;
        this.stateMachine = context.services.get<GameStateMachine>('stateMachine');
        this.app = context.services.get<AppBase>('app');
        const canvas = document.getElementById('application-canvas') as HTMLCanvasElement | null;
        if (canvas === null) {
            throw new Error('application-canvas element is missing');
        }
        this.input = new InputAdapter(canvas);
        this.input.attach(() => this.onLockChange());
        this.weapon = new WeaponController(context.eventBus);
        try {
            this.enemyTargets = context.services.get<EnemyTargetProvider>('enemySystem');
        } catch {
            this.enemyTargets = null;
        }
        const log = (line: string): void => {
            const list = document.getElementById('hud-event-log');
            if (list === null) {
                return;
            }
            const item = document.createElement('li');
            item.textContent = line;
            list.prepend(item);
            while (list.children.length > 5) {
                list.lastElementChild?.remove();
            }
        };
        this.cleanups.push(
            context.eventBus.on('weapon.fired', ({ weaponId }) => log(`Fired ${weaponId}`)),
            context.eventBus.on('combat.hitConfirmed', ({ targetId, damage }) => log(`Hit ${targetId} for ${damage}`)),
            context.eventBus.on('enemy.detected', ({ enemyId }) => log(`${enemyId} spotted you!`)),
            context.eventBus.on('settings.changed', ({ sensitivity }) => {
                this.sensitivity = Math.max(0.2, Math.min(3, sensitivity));
            }),
            // Build 3: this is how enemies damage the player. Enemy shots
            // emit combat.hitConfirmed with targetId 'player'; the damage
            // itself still goes through this system's private damage().
            context.eventBus.on('combat.hitConfirmed', ({ targetId, damage }) => {
                if (targetId === 'player') {
                    this.damage(damage);
                }
            }),
            context.eventBus.on('weapon.reloadStarted', ({ weaponId }) => log(`Reloading ${weaponId}…`)),
            context.eventBus.on('weapon.reloadCompleted', ({ weaponId, magazine, reserve }) =>
                log(`Reloaded ${weaponId} ${magazine} / ${reserve}`)
            ),
            context.eventBus.on('mission.started', (payload) => this.startMission(payload)),
            context.eventBus.on('mission.retryCheckpoint', ({ position }) => this.retryCheckpoint(position)),
            context.eventBus.on('mission.exitRequested', () => {
                this.missionActive = false;
                this.exitToMenu();
            }),
            context.eventBus.on('app.stateChanged', ({ newState }) => {
                if (newState === 'mainMenu') {
                    this.missionActive = false;
                }
                // Build 5: victory/defeat overlays need the mouse, so
                // the pointer lock must be released when they appear.
                // (Defeat already releases in damage(); victory does not
                // go through damage, so it releases here.)
                if (newState === 'victory') {
                    this.input?.releasePointerLock();
                }
            })
        );
        try {
            const save = context.services.get<SaveRepository>('save');
            const data = await save.load();
            this.sensitivity = Math.max(0.2, Math.min(3, data.settings.sensitivity));
        } catch {
            this.sensitivity = 1;
        }
        this.bindButtons();
    }

    update(dt: number): void {
        if (dt > 0) {
            this.smoothedFps = this.smoothedFps * 0.95 + (1 / dt) * 0.05;
        }
        if (this.stateMachine?.current !== 'playing' || this.playerRoot === null || this.input === null) {
            return;
        }
        const pausePressed = this.input.has('KeyP');
        if (pausePressed && !this.previousPauseKey) {
            this.pause();
            this.previousPauseKey = true;
            return;
        }
        this.previousPauseKey = pausePressed;

        // Debug damage is on a key, not only the HUD button: in pointer
        // lock the mouse cannot reach HUD buttons, but keyboard events can.
        const damagePressed = this.input.has('KeyH');
        if (damagePressed && !this.previousDamageKey) {
            this.damage(10);
        }
        this.previousDamageKey = damagePressed;

        const mouse = this.input.consumeMouseDelta();
        this.yaw -= mouse.x * 0.0022 * this.sensitivity;
        this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - mouse.y * 0.0022 * this.sensitivity));

        const forward = forwardFromYaw(this.yaw);
        const right = rightFromYaw(this.yaw);
        let inputX = 0;
        let inputZ = 0;
        if (this.input.has('KeyW')) inputZ += 1;
        if (this.input.has('KeyS')) inputZ -= 1;
        if (this.input.has('KeyD')) inputX += 1;
        if (this.input.has('KeyA')) inputX -= 1;
        const inputLength = Math.hypot(inputX, inputZ);
        if (inputLength > 0) {
            inputX /= inputLength;
            inputZ /= inputLength;
        }
        const crouching = this.input.has('KeyC');
        const sprinting = this.input.has('ShiftLeft') || this.input.has('ShiftRight');
        const speed = crouching ? 2.2 : sprinting && inputZ > 0 ? 7.5 : 4.5;
        const moveX = (right.x * inputX + forward.x * inputZ) * speed * dt;
        const moveZ = (right.z * inputX + forward.z * inputZ) * speed * dt;

        const position = this.playerRoot.getPosition();
        const next = moveWithCollisions(
            { x: position.x, z: position.z },
            { x: moveX, z: moveZ },
            PLAYER_RADIUS,
            CRATES
        );

        if (this.input.has('Space') && this.grounded) {
            this.verticalVelocity = 8.5;
            this.grounded = false;
        }
        this.verticalVelocity -= 22 * dt;
        let nextY = position.y + this.verticalVelocity * dt;
        if (nextY <= 0) {
            nextY = 0;
            this.verticalVelocity = 0;
            this.grounded = true;
        }
        this.playerRoot.setPosition(next.x, nextY, next.z);
        this.playerRoot.setEulerAngles(0, (this.yaw * 180) / Math.PI, 0);

        const pose = this.animation.update(dt, inputLength * speed, crouching, this.grounded);
        this.lastCrouchFactor = pose.crouchFactor;
        this.applyPose(pose);
        this.updateCamera();
        this.weapon?.update(dt);
        this.handleWeaponInput();
        this.updateTargets(dt);
        this.updateEffects(dt);
        this.updateHud(dt, inputLength * speed, crouching, sprinting);
    }

    dispose(): void {
        this.destroyArena();
        this.input?.detach();
        this.input = null;
        for (const cleanup of this.cleanups.splice(0)) {
            cleanup();
        }
        this.app = null;
        this.eventBus = null;
        this.stateMachine = null;
        this.weapon = null;
    }

    /** Player snapshot for the enemy system; null when there is no arena. */
    getPlayerSnapshot(): {
        readonly x: number;
        readonly y: number;
        readonly z: number;
        readonly alive: boolean;
    } | null {
        if (this.playerRoot === null) {
            return null;
        }
        const position = this.playerRoot.getPosition();
        return { x: position.x, y: position.y, z: position.z, alive: this.health > 0 };
    }

    private bindButtons(): void {
        const on = (id: string, handler: () => void): void => {
            const element = document.getElementById(id);
            if (element === null) {
                return;
            }
            element.addEventListener('click', handler);
            this.cleanups.push(() => element.removeEventListener('click', handler));
        };
        on('btn-test-arena', () => this.enterArena());
        on('btn-resume', () => this.resume());
        on('btn-restart-arena', () => this.restartArena());
        on('btn-exit-arena', () => this.exitToMenu());
        on('btn-results-restart', () => this.restartArena());
        on('btn-results-menu', () => this.exitToMenu());
        on('btn-debug-damage', () => this.damage(10));
    }

    private hideResults(): void {
        const overlay = document.getElementById('results-overlay');
        if (overlay !== null) {
            overlay.hidden = true;
        }
    }

    private enterArena(): void {
        if (this.app === null || this.stateMachine === null || this.input === null) {
            return;
        }
        if (this.arena !== null) {
            return;
        }
        this.hideResults();
        const arenaHud = document.getElementById('arena-hud');
        if (arenaHud !== null) {
            arenaHud.classList.remove('mission-mode');
        }
        this.buildArena();
        this.weapon?.reset();
        const menu = document.getElementById('main-menu');
        if (menu !== null) menu.hidden = true;
        const hud = document.getElementById('arena-hud');
        if (hud !== null) hud.hidden = false;
        this.stateMachine.transitionTo('loading');
        this.stateMachine.transitionTo('playing');
        this.input.requestPointerLock();
        this.input.consumeLeftClick();
        this.updateHud(0, 0, false, false);
    }

    private restartArena(): void {
        if (this.playerRoot === null || this.stateMachine === null || this.input === null) {
            return;
        }
        // In mission mode the pause menu's Restart is a full mission
        // restart, not an arena respawn: the mission flow rebuilds the
        // arena and the enemy plan from the level record.
        if (this.missionActive) {
            const pause = document.getElementById('pause-overlay');
            if (pause !== null) pause.hidden = true;
            this.eventBus?.emit('mission.requested', { levelId: this.missionLevelId });
            return;
        }
        this.hideResults();
        this.respawn();
        this.resetTargets();
        this.weapon?.reset();
        const pause = document.getElementById('pause-overlay');
        if (pause !== null) pause.hidden = true;
        this.stateMachine.transitionTo('playing');
        this.eventBus?.emit('arena.restarted', { source: 'player' });
        this.input.requestPointerLock();
        this.input.consumeLeftClick();
    }

    private exitToMenu(): void {
        if (this.stateMachine === null) {
            return;
        }
        this.hideResults();
        const hudElement = document.getElementById('arena-hud');
        if (hudElement !== null) {
            hudElement.classList.remove('mission-mode');
        }
        this.destroyArena();
        const pause = document.getElementById('pause-overlay');
        if (pause !== null) pause.hidden = true;
        const hud = document.getElementById('arena-hud');
        if (hud !== null) hud.hidden = true;
        const menu = document.getElementById('main-menu');
        if (menu !== null) menu.hidden = false;
        this.input?.releasePointerLock();
        this.stateMachine.transitionTo('mainMenu');
    }

    private pause(): void {
        if (this.stateMachine?.current !== 'playing') {
            return;
        }
        this.stateMachine.transitionTo('paused');
        const pause = document.getElementById('pause-overlay');
        if (pause !== null) pause.hidden = false;
    }

    private resume(): void {
        if (this.stateMachine === null || this.input === null) {
            return;
        }
        const pause = document.getElementById('pause-overlay');
        if (pause !== null) pause.hidden = true;
        this.stateMachine.transitionTo('playing');
        this.input.requestPointerLock();
        this.input.consumeLeftClick();
    }

    private onLockChange(): void {
        // Esc (or a tab switch) releases the lock; that is the pause signal.
        // A failed lock request fires no change, so entering never pauses.
        if (this.input !== null && !this.input.pointerLocked) {
            this.pause();
        }
    }

    private damage(amount: number): void {
        if (this.stateMachine?.current !== 'playing') {
            return;
        }
        this.health = clampHealth(this.health - amount, PLAYER_MAX_HEALTH);
        this.eventBus?.emit('player.healthChanged', {
            current: this.health,
            maximum: PLAYER_MAX_HEALTH,
            delta: -amount
        });
        if (this.health <= 0) {
            // Build 5: in mission mode death is defeat, not respawn.
            // MissionSystem shows the defeat screen (with retry from
            // checkpoint) when it sees the defeat state.
            if (this.missionActive) {
                this.input?.releasePointerLock();
                this.stateMachine?.transitionTo('defeat');
            } else {
                this.respawn();
            }
        }
        this.updateHud(0, 0, false, false);
    }

    /** Shared playing transition: paused resumes directly, every other state goes via loading. */
    private transitionToPlaying(): void {
        if (this.stateMachine === null) {
            return;
        }
        if (this.stateMachine.current === 'playing') {
            return;
        }
        if (this.stateMachine.current === 'paused') {
            this.stateMachine.transitionTo('playing');
            return;
        }
        this.stateMachine.transitionTo('loading');
        this.stateMachine.transitionTo('playing');
    }

    private startMission(payload: MissionStartPayload): void {
        if (this.app === null || this.stateMachine === null || this.input === null) {
            return;
        }
        this.hideResults();
        const pause = document.getElementById('pause-overlay');
        if (pause !== null) pause.hidden = true;
        if (this.arena !== null) {
            this.destroyArena();
        }
        // Build 5 UI polish: mission HUD is clean — no debug button,
        // no greybox note, no debug coordinates. The arena keeps them.
        const hudElement = document.getElementById('arena-hud');
        if (hudElement !== null) {
            hudElement.classList.add('mission-mode');
        }
        this.missionActive = true;
        this.missionLevelId = payload.levelId;
        this.missionRifleReserve = payload.rifleReserve;
        this.buildArena({
            spawnX: payload.playerSpawn.x,
            spawnZ: payload.playerSpawn.z,
            includeTargets: false,
            zones: payload.zones,
            tint: payload.environmentTint
        });
        this.weapon?.reset();
        this.weapon?.setRifleReserve(payload.rifleReserve);
        const menu = document.getElementById('main-menu');
        if (menu !== null) menu.hidden = true;
        const hud = document.getElementById('arena-hud');
        if (hud !== null) hud.hidden = false;
        this.transitionToPlaying();
        this.input.requestPointerLock();
        this.input.consumeLeftClick();
        this.updateHud(0, 0, false, false);
    }

    private retryCheckpoint(position: readonly [number, number, number]): void {
        if (this.playerRoot === null || this.stateMachine === null || this.input === null) {
            return;
        }
        this.playerRoot.setPosition(position[0], 0, position[2]);
        this.verticalVelocity = 0;
        this.grounded = true;
        const previousHealth = this.health;
        this.health = PLAYER_MAX_HEALTH;
        this.eventBus?.emit('player.healthChanged', {
            current: this.health,
            maximum: PLAYER_MAX_HEALTH,
            delta: PLAYER_MAX_HEALTH - previousHealth
        });
        this.weapon?.reset();
        this.weapon?.setRifleReserve(this.missionRifleReserve);
        this.transitionToPlaying();
        this.input.requestPointerLock();
        this.input.consumeLeftClick();
        this.updateHud(0, 0, false, false);
    }

    private aimDirection(): Vec3 {
        const cosPitch = Math.cos(this.pitch);
        return {
            x: -Math.sin(this.yaw) * cosPitch,
            y: Math.sin(this.pitch),
            z: -Math.cos(this.yaw) * cosPitch
        };
    }

    private muzzlePosition(): Vec3 {
        if (this.playerRoot === null) {
            return { x: 0, y: 1.4, z: 0 };
        }
        const position = this.playerRoot.getPosition();
        const forward = forwardFromYaw(this.yaw);
        const right = rightFromYaw(this.yaw);
        return {
            x: position.x + forward.x * 0.7 + right.x * 0.45,
            y: position.y + 1.35 - this.lastCrouchFactor * 0.3,
            z: position.z + forward.z * 0.7 + right.z * 0.45
        };
    }

    private handleWeaponInput(): void {
        if (this.input === null || this.weapon === null || this.camera === null || this.playerRoot === null) {
            return;
        }
        const digitCodes: readonly (readonly [string, WeaponId])[] = [
            ['Digit1', 'rifle'],
            ['Digit2', 'pistol'],
            ['Digit3', 'shotgun']
        ];
        const pressedDigits = new Set<string>();
        for (const [code, id] of digitCodes) {
            if (this.input.has(code)) {
                pressedDigits.add(code);
                if (!this.previousDigits.has(code) && this.weapon.switchTo(id)) {
                    this.updateHud(0, 0, false, false);
                }
            }
        }
        this.previousDigits = pressedDigits;

        const reloadPressed = this.input.has('KeyR');
        if (reloadPressed && !this.previousReloadKey) {
            this.weapon.startReload();
        }
        this.previousReloadKey = reloadPressed;

        const definition = this.weapon.definition;
        // Auto weapons fire while held, but a press that starts and ends
        // between two frames must still fire once — otherwise a quick
        // click is silently lost. The entry click is discarded in
        // enterArena/resume/restart so a menu click never fires a shot.
        const clicked = this.input.consumeLeftClick();
        const wantsFire = definition.fireMode === 'auto' ? this.input.isLeftDown() || clicked : clicked;
        if (!wantsFire) {
            return;
        }
        const cameraPosition = this.camera.getPosition();
        const origin: Vec3 = { x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z };
        const aim = this.aimDirection();
        const result = this.weapon.tryFire([origin.x, origin.y, origin.z], [aim.x, aim.y, aim.z]);
        if (result.kind !== 'fired') {
            if (result.kind === 'empty') {
                this.logLine('Click — magazine empty, reloading…');
            }
            return;
        }
        this.pitch = Math.min(1.2, this.pitch + definition.recoilPitch);
        const muzzle = this.muzzlePosition();
        if (this.flash !== null) {
            this.flash.setPosition(muzzle.x, muzzle.y, muzzle.z);
            this.flash.enabled = true;
            this.flashTimer = 0.05;
        }
        const blockers = this.blockerAabbs();
        let endPoint: Vec3 = {
            x: origin.x + aim.x * definition.range,
            y: origin.y + aim.y * definition.range,
            z: origin.z + aim.z * definition.range
        };
        // Build 3: raycast targets are the boards plus the alive enemies
        // from the enemy system (obtained only through its typed service
        // interface). Board hits are still resolved locally; enemy hits
        // only emit combat.hitConfirmed — enemy health is owned by
        // EnemySystem, never damaged here.
        const enemyTargets = this.enemyTargets?.getEnemyTargets() ?? [];
        for (let pellet = 0; pellet < definition.pellets; pellet += 1) {
            const spreadX = (Math.random() * 2 - 1) * definition.spreadRadians;
            const spreadY = (Math.random() * 2 - 1) * definition.spreadRadians;
            const raw = { x: aim.x + spreadX, y: aim.y + spreadY, z: aim.z };
            const length = Math.hypot(raw.x, raw.y, raw.z) || 1;
            const direction: Vec3 = { x: raw.x / length, y: raw.y / length, z: raw.z / length };
            const hit = raycastScene(
                origin,
                direction,
                definition.range,
                [
                    ...this.targets
                        .filter((target) => target.alive)
                        .map((target) => ({ id: target.id, aabb: target.aabb })),
                    ...enemyTargets
                ],
                blockers
            );
            endPoint = hit.point;
            if (hit.kind === 'target') {
                const target = this.targets.find((candidate) => candidate.id === hit.id);
                if (enemyTargets.some((enemy) => enemy.id === hit.id)) {
                    this.eventBus?.emit('combat.hitConfirmed', {
                        sourceId: 'player',
                        targetId: hit.id,
                        hitZone: 'body',
                        damage: definition.damagePerPellet,
                        worldPosition: [hit.point.x, hit.point.y, hit.point.z]
                    });
                    this.showHitmarker();
                } else if (target !== undefined) {
                    const outcome = applyDamage(target.health, definition.damagePerPellet);
                    target.health = outcome.health;
                    this.eventBus?.emit('combat.hitConfirmed', {
                        sourceId: 'player',
                        targetId: target.id,
                        hitZone: 'body',
                        damage: definition.damagePerPellet,
                        worldPosition: [hit.point.x, hit.point.y, hit.point.z]
                    });
                    this.showHitmarker();
                    if (outcome.died) {
                        target.alive = false;
                        target.respawnTimer = 5;
                        target.group.setLocalEulerAngles(-80, 0, 0);
                        this.logLine(`${target.id} down — respawns in 5 s`);
                    }
                }
            }
            if (hit.kind === 'target' || hit.kind === 'blocker') {
                this.showImpact(hit.point);
            }
        }
        this.showTracer(muzzle, endPoint);
    }

    private blockerAabbs(): Aabb3[] {
        const fromObstacle = (obstacle: Obstacle): Aabb3 => ({
            minX: obstacle.minX,
            maxX: obstacle.maxX,
            minY: 0,
            maxY: obstacle.top,
            minZ: obstacle.minZ,
            maxZ: obstacle.maxZ
        });
        return [
            ...CRATES.map(fromObstacle),
            ...WALLS.map(fromObstacle),
            { minX: -20, maxX: 20, minY: -0.2, maxY: 0, minZ: -20, maxZ: 20 }
        ];
    }

    private showTracer(from: Vec3, to: Vec3): void {
        if (this.tracer === null) {
            return;
        }
        const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
        this.tracer.setPosition((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
        this.tracer.setLocalScale(0.03, 0.03, Math.max(0.1, distance));
        this.tracer.lookAt(to.x, to.y, to.z);
        this.tracer.enabled = true;
        this.tracerTimer = 0.06;
    }

    private showImpact(point: Vec3): void {
        if (this.impact === null) {
            return;
        }
        this.impact.setPosition(point.x, point.y, point.z);
        this.impact.enabled = true;
        this.impactTimer = 0.15;
    }

    private showHitmarker(): void {
        const marker = document.getElementById('hud-hitmarker');
        if (marker !== null) {
            marker.textContent = 'HIT';
        }
        this.hitmarkerTimer = 0.25;
    }

    private logLine(line: string): void {
        const list = document.getElementById('hud-event-log');
        if (list === null) {
            return;
        }
        const item = document.createElement('li');
        item.textContent = line;
        list.prepend(item);
        while (list.children.length > 5) {
            list.lastElementChild?.remove();
        }
    }

    private updateTargets(dt: number): void {
        for (const target of this.targets) {
            if (target.alive) {
                continue;
            }
            target.respawnTimer -= dt;
            if (target.respawnTimer <= 0) {
                target.alive = true;
                target.health = target.maxHealth;
                target.group.setLocalEulerAngles(0, 0, 0);
            }
        }
    }

    private updateEffects(dt: number): void {
        if (this.tracerTimer > 0) {
            this.tracerTimer -= dt;
            if (this.tracerTimer <= 0 && this.tracer !== null) {
                this.tracer.enabled = false;
            }
        }
        if (this.flashTimer > 0) {
            this.flashTimer -= dt;
            if (this.flashTimer <= 0 && this.flash !== null) {
                this.flash.enabled = false;
            }
        }
        if (this.impactTimer > 0) {
            this.impactTimer -= dt;
            if (this.impactTimer <= 0 && this.impact !== null) {
                this.impact.enabled = false;
            }
        }
        if (this.hitmarkerTimer > 0) {
            this.hitmarkerTimer -= dt;
            if (this.hitmarkerTimer <= 0) {
                const marker = document.getElementById('hud-hitmarker');
                if (marker !== null) {
                    marker.textContent = '';
                }
            }
        }
    }

    private resetTargets(): void {
        for (const target of this.targets) {
            target.alive = true;
            target.health = target.maxHealth;
            target.respawnTimer = 0;
            target.group.setLocalEulerAngles(0, 0, 0);
        }
    }

    private respawn(): void {
        if (this.playerRoot === null) {
            return;
        }
        this.playerRoot.setPosition(SPAWN.x, 0, SPAWN.z);
        this.verticalVelocity = 0;
        this.grounded = true;
        this.health = PLAYER_MAX_HEALTH;
        this.eventBus?.emit('player.healthChanged', {
            current: this.health,
            maximum: PLAYER_MAX_HEALTH,
            delta: PLAYER_MAX_HEALTH
        });
    }

    private buildArena(
        options: {
            readonly spawnX?: number;
            readonly spawnZ?: number;
            readonly includeTargets?: boolean;
            readonly zones?: readonly ZoneDefinition[];
            readonly tint?: { readonly clear: readonly [number, number, number]; readonly lightIntensity: number };
        } = {}
    ): void {
        if (this.app === null) {
            return;
        }
        const spawnX = options.spawnX ?? SPAWN.x;
        const spawnZ = options.spawnZ ?? SPAWN.z;
        const arena = new PlayEntity('arena');
        arena.addChild(boxEntity('floor', 40, 0.2, 40, 0, -0.1, 0));
        arena.addChild(boxEntity('wall-north', 41, 3, 1, 0, 1.5, -20));
        arena.addChild(boxEntity('wall-south', 41, 3, 1, 0, 1.5, 20));
        arena.addChild(boxEntity('wall-west', 1, 3, 41, -20, 1.5, 0));
        arena.addChild(boxEntity('wall-east', 1, 3, 41, 20, 1.5, 0));
        for (const crate of CRATES) {
            const width = crate.maxX - crate.minX;
            const depth = crate.maxZ - crate.minZ;
            arena.addChild(
                boxEntity(
                    'crate',
                    width,
                    crate.top,
                    depth,
                    (crate.minX + crate.maxX) / 2,
                    crate.top / 2,
                    (crate.minZ + crate.maxZ) / 2
                )
            );
        }

        const player = new PlayEntity('player');
        player.setPosition(spawnX, 0, spawnZ);
        const torso = boxEntity('torso', 0.6, 0.9, 0.35, 0, 1.15, 0);
        const head = new PlayEntity('head');
        head.addComponent('render', { type: 'sphere' });
        head.setLocalScale(0.45, 0.45, 0.45);
        head.setLocalPosition(0, 1.85, 0);
        player.addChild(torso);
        player.addChild(head);
        const makeLimb = (name: string, x: number, isLeg: boolean): Entity => {
            const limb = new PlayEntity(name);
            limb.setLocalPosition(x, isLeg ? 0.75 : 1.45, 0);
            const mesh = boxEntity(`${name}-mesh`, 0.18, isLeg ? 0.75 : 0.7, 0.18, 0, isLeg ? -0.375 : -0.35, 0);
            limb.addChild(mesh);
            player.addChild(limb);
            return limb;
        };
        this.leftLeg = makeLimb('leg-left', -0.2, true);
        this.rightLeg = makeLimb('leg-right', 0.2, true);
        this.leftArm = makeLimb('arm-left', -0.42, false);
        this.rightArm = makeLimb('arm-right', 0.42, false);
        this.torso = torso;

        // Build 5: mission mode has no target boards — the objectives
        // are enemies and zones, not boards. Arena mode is unchanged.
        if (options.includeTargets !== false) {
            for (const spot of TARGET_SPOTS) {
                const group = new PlayEntity(spot.id);
                group.setLocalPosition(spot.x, 0, spot.z);
                const board = boxEntity(`${spot.id}-board`, 1.2, 1.8, 0.1, 0, 1.1, 0);
                const stand = boxEntity(`${spot.id}-stand`, 0.15, 0.4, 0.15, 0, 0.2, 0);
                group.addChild(board);
                group.addChild(stand);
                arena.addChild(group);
                this.targets.push({
                    id: spot.id,
                    group,
                    aabb: {
                        minX: spot.x - 0.6,
                        maxX: spot.x + 0.6,
                        minY: 0.2,
                        maxY: 2.0,
                        minZ: spot.z - 0.05,
                        maxZ: spot.z + 0.05
                    },
                    health: 50,
                    maxHealth: 50,
                    alive: true,
                    respawnTimer: 0
                });
            }
        }
        // Build 5: objective zones are flat marker boxes on the floor,
        // so activate/reach/defend zones are visible in the world.
        for (const zone of options.zones ?? []) {
            arena.addChild(boxEntity(`zone-${zone.id}`, zone.size, 0.2, zone.size, zone.x, 0.1, zone.z));
        }
        const tracer = boxEntity('tracer', 0.03, 0.03, 1, 0, -10, 0);
        tracer.enabled = false;
        arena.addChild(tracer);
        this.tracer = tracer;
        const flash = boxEntity('muzzle-flash', 0.2, 0.2, 0.2, 0, -10, 0);
        flash.enabled = false;
        arena.addChild(flash);
        this.flash = flash;
        const impact = new PlayEntity('impact');
        impact.addComponent('render', { type: 'sphere' });
        impact.setLocalScale(0.25, 0.25, 0.25);
        impact.setLocalPosition(0, -10, 0);
        impact.enabled = false;
        arena.addChild(impact);
        this.impact = impact;

        this.app.root.addChild(arena);
        this.app.root.addChild(player);
        this.arena = arena;
        this.playerRoot = player;
        const foundCamera = this.app.root.findByName('camera');
        this.camera = foundCamera instanceof PlayEntity ? foundCamera : null;
        // Build 5: per-environment tint, restored in destroyArena.
        if (options.tint !== undefined && this.camera !== null) {
            const cameraComponent = this.camera.findComponent('camera');
            if (cameraComponent !== null && cameraComponent !== undefined) {
                cameraComponent.clearColor.set(options.tint.clear[0], options.tint.clear[1], options.tint.clear[2]);
            }
            const lightEntity = this.app.root.findByName('light');
            if (lightEntity instanceof PlayEntity) {
                const lightComponent = lightEntity.findComponent('light') as LightComponent | null;
                if (lightComponent !== null && lightComponent !== undefined) {
                    lightComponent.intensity = options.tint.lightIntensity;
                }
            }
        }
        this.health = PLAYER_MAX_HEALTH;
        this.verticalVelocity = 0;
        this.grounded = true;
        this.yaw = 0;
        this.pitch = 0;
        this.animation.reset();
    }

    private destroyArena(): void {
        this.arena?.destroy();
        this.playerRoot?.destroy();
        this.arena = null;
        this.playerRoot = null;
        this.targets = [];
        this.tracer = null;
        this.flash = null;
        this.impact = null;
        this.leftLeg = null;
        this.rightLeg = null;
        this.leftArm = null;
        this.rightArm = null;
        this.torso = null;
        if (this.camera !== null) {
            this.camera.setPosition(0, 2, 6);
            this.camera.lookAt(0, 1, 0);
            const cameraComponent = this.camera.findComponent('camera');
            if (cameraComponent !== null && cameraComponent !== undefined) {
                cameraComponent.clearColor.set(0.043, 0.086, 0.149);
            }
        }
        if (this.app !== null) {
            const lightEntity = this.app.root.findByName('light');
            if (lightEntity instanceof PlayEntity) {
                const lightComponent = lightEntity.findComponent('light') as LightComponent | null;
                if (lightComponent !== null && lightComponent !== undefined) {
                    lightComponent.intensity = 1;
                }
            }
        }
        this.camera = null;
    }

    private applyPose(pose: ReturnType<PlayerAnimation['update']>): void {
        const degrees = (value: number): number => (value * 180) / Math.PI;
        if (this.leftLeg !== null) this.leftLeg.setLocalEulerAngles(degrees(pose.legSwing) * 0.9, 0, 0);
        if (this.rightLeg !== null) this.rightLeg.setLocalEulerAngles(-degrees(pose.legSwing) * 0.9, 0, 0);
        if (this.leftArm !== null) this.leftArm.setLocalEulerAngles(degrees(pose.armSwing) * 0.7, 0, 0);
        if (this.rightArm !== null) this.rightArm.setLocalEulerAngles(-degrees(pose.armSwing) * 0.7, 0, 0);
        if (this.torso !== null) {
            this.torso.setLocalPosition(0, 1.15 + pose.bob - pose.crouchFactor * 0.3, 0);
            this.torso.setLocalScale(0.6, 0.9 * (1 - pose.crouchFactor * 0.25), 0.35);
        }
    }

    private updateCamera(): void {
        if (this.playerRoot === null || this.camera === null) {
            return;
        }
        const position = this.playerRoot.getPosition();
        const forward = forwardFromYaw(this.yaw);
        const right = rightFromYaw(this.yaw);
        const eyeHeight = 1.7 - 0.35 * this.lastCrouchFactor;
        const target = {
            x: position.x + right.x * 0.55,
            y: position.y + eyeHeight,
            z: position.z + right.z * 0.55
        };
        const direction = {
            x: -forward.x,
            y: -Math.tan(this.pitch) * 0.6,
            z: -forward.z
        };
        const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
        direction.x /= length;
        direction.y /= length;
        direction.z /= length;
        const distance = cameraDistance(target, direction, 4, [...CRATES, ...WALLS]);
        const cameraPosition = {
            x: target.x + direction.x * distance,
            y: target.y + direction.y * distance,
            z: target.z + direction.z * distance
        };
        this.camera.setPosition(cameraPosition.x, cameraPosition.y, cameraPosition.z);
        // Look exactly along the aim direction, so the crosshair, the ray
        // and the camera agree (SRS section 2.3).
        const aim = this.aimDirection();
        this.camera.lookAt(cameraPosition.x + aim.x * 10, cameraPosition.y + aim.y * 10, cameraPosition.z + aim.z * 10);
    }

    private updateHud(dt: number, speed: number, crouching: boolean, sprinting: boolean): void {
        this.hudTimer += dt;
        if (dt > 0 && this.hudTimer < 0.1) {
            return;
        }
        this.hudTimer = 0;
        const healthText = document.getElementById('hud-health-text');
        if (healthText !== null) {
            healthText.textContent = `Health ${this.health} / ${PLAYER_MAX_HEALTH}`;
        }
        const healthBar = document.getElementById('hud-health-bar');
        if (healthBar !== null) {
            healthBar.style.width = `${this.health}%`;
        }
        // Build 5 UI polish: low-health pulse, presentation only.
        const healthBlock = document.querySelector('.hud-health');
        if (healthBlock !== null) {
            healthBlock.classList.toggle('low-health', this.health > 0 && this.health <= 30);
        }
        const weaponText = document.getElementById('hud-weapon-text');
        if (weaponText !== null && this.weapon !== null) {
            const definition = this.weapon.definition;
            weaponText.textContent = `${definition.name} · ${this.weapon.magazine} / ${this.weapon.reserve}${this.weapon.isReloading ? ' (reloading…)' : ''}`;
        }
        const debug = document.getElementById('hud-debug-text');
        if (debug !== null && this.playerRoot !== null) {
            const position = this.playerRoot.getPosition();
            const state = !this.grounded
                ? 'Airborne'
                : crouching
                  ? 'Crouch'
                  : sprinting
                    ? 'Sprint'
                    : speed > 0.1
                      ? 'Walk'
                      : 'Idle';
            debug.textContent = `x ${position.x.toFixed(1)} · z ${position.z.toFixed(1)} · ${state} · ${this.smoothedFps.toFixed(0)} FPS · greybox placeholder`;
        }
    }
}
