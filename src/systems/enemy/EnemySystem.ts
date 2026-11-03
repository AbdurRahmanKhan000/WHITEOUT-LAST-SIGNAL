import type { AppBase, Entity } from 'playcanvas';
import { Entity as PlayEntity } from 'playcanvas';

import type { GameStateMachine } from '../../app/GameStateMachine';
import type { EventBus } from '../../core/EventBus';
import type { GameContext, GameSystem } from '../../core/GameTypes';
import {
    DEFAULT_DIFFICULTY,
    DIFFICULTY_SCALES,
    GRUNT,
    TEST_ARENA_CRATES,
    TEST_ARENA_PATROL_ROUTE,
    TEST_ARENA_SPAWNS,
    TEST_ARENA_WAYPOINTS,
    enemyDefinitionForDifficulty
} from '../../data/enemies';
import { raycastScene } from '../../services/raycast';
import type { Aabb3 } from '../../services/raycast';

import { EnemyBrain } from './EnemyBrain';
import { NavigationGraph } from './NavigationGraph';
import { soundHeard } from './Perception';
import type { Vec2 } from './Perception';

/**
 * Build 3 — Enemy system (SRS section 6-B, Build 3 gate).
 *
 * GREYBOX PLACEHOLDER, stated plainly: enemy figures are boxes and a
 * sphere with arms posed forward, exactly like the Build 1 player figure.
 * They are NOT realistic rigged GLB characters, and no SRS animation
 * clips are met by Build 3.
 *
 * Wiring contract (SRS section 5, no cross-system imports): this system
 * exposes only getEnemyTargets() through the EnemyTargetProvider
 * interface, which PlayerSystem obtains from the service container. It
 * reads the player only through the PlayerSnapshotProvider interface
 * (a getPlayerSnapshot() method on the player system, obtained from the
 * container), never by importing the player module. Enemy health is
 * owned here: player shots only emit combat.hitConfirmed, and this
 * system applies the damage through the brain (which uses
 * DamageService.applyDamage) — PlayerSystem never damages enemies
 * directly.
 */

export interface EnemyTargetSnapshot {
    readonly id: string;
    readonly aabb: Aabb3;
}

export interface EnemyTargetProvider {
    getEnemyTargets(): readonly EnemyTargetSnapshot[];
}

export interface PlayerSnapshot {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly alive: boolean;
}

export interface PlayerSnapshotProvider {
    getPlayerSnapshot(): PlayerSnapshot | null;
}

interface EnemyRuntime {
    readonly brain: EnemyBrain;
    readonly root: Entity;
    readonly leftLeg: Entity | null;
    readonly rightLeg: Entity | null;
    readonly spawn: Vec2;
    swingPhase: number;
    previousX: number;
    previousZ: number;
}

const WALLS: readonly Aabb3[] = [
    { minX: -20, maxX: 20, minY: 0, maxY: 3, minZ: -20.5, maxZ: -19.5 },
    { minX: -20, maxX: 20, minY: 0, maxY: 3, minZ: 19.5, maxZ: 20.5 },
    { minX: -20.5, maxX: -19.5, minY: 0, maxY: 3, minZ: -20, maxZ: 20 },
    { minX: 19.5, maxX: 20.5, minY: 0, maxY: 3, minZ: -20, maxZ: 20 }
];

function boxEntity(name: string, sx: number, sy: number, sz: number, x: number, y: number, z: number): Entity {
    const entity = new PlayEntity(name);
    entity.addComponent('render', { type: 'box' });
    entity.setLocalScale(sx, sy, sz);
    entity.setLocalPosition(x, y, z);
    return entity;
}

const STATE_LABELS: readonly (readonly [string, string])[] = [
    ['patrol', 'Patrol'],
    ['investigate', 'Investigate'],
    ['alert', 'Alert'],
    ['chase', 'Chase'],
    ['attack', 'Attack'],
    ['takeCover', 'TakeCover'],
    ['stunned', 'Stunned'],
    ['dead', 'Dead']
];

export class EnemySystem implements GameSystem {
    readonly name = 'enemy';

    private app: AppBase | null = null;
    private eventBus: EventBus | null = null;
    private stateMachine: GameStateMachine | null = null;
    private playerProvider: PlayerSnapshotProvider | null = null;
    private readonly cleanups: (() => void)[] = [];
    private enemies: EnemyRuntime[] = [];
    private graph: NavigationGraph | null = null;
    private blockers: readonly Aabb3[] = [];
    private hudTimer = 0.25;
    private shotCounter = 0;

    initialize(context: GameContext): void {
        this.eventBus = context.eventBus;
        this.stateMachine = context.services.get<GameStateMachine>('stateMachine');
        this.app = context.services.get<AppBase>('app');
        if (context.services.has('playerSystem')) {
            this.playerProvider = context.services.get<PlayerSnapshotProvider>('playerSystem');
        }
        this.graph = new NavigationGraph(
            TEST_ARENA_WAYPOINTS.map((waypoint) => ({ id: waypoint.id, x: waypoint.x, z: waypoint.z })),
            TEST_ARENA_CRATES
        );
        this.blockers = [
            ...TEST_ARENA_CRATES.map((crate): Aabb3 => ({
                minX: crate.minX,
                maxX: crate.maxX,
                minY: 0,
                maxY: crate.top,
                minZ: crate.minZ,
                maxZ: crate.maxZ
            })),
            ...WALLS
        ];
        this.cleanups.push(
            context.eventBus.on('combat.hitConfirmed', ({ sourceId, targetId, damage }) =>
                this.onHitConfirmed(sourceId, targetId, damage)
            ),
            context.eventBus.on('weapon.fired', ({ ownerId, origin }) => this.onWeaponFired(ownerId, origin)),
            context.eventBus.on('arena.restarted', () => this.resetOrSpawn())
        );
    }

    update(dt: number): void {
        if (this.stateMachine?.current === 'mainMenu') {
            // Leaving the arena destroys the enemies. Pause deliberately
            // does NOT: pausing must freeze the simulation, not clear it.
            if (this.enemies.length > 0) {
                this.destroyEnemies();
            }
            return;
        }
        if (this.stateMachine?.current !== 'playing') {
            return;
        }
        const snapshot = this.playerProvider?.getPlayerSnapshot() ?? null;
        if (snapshot === null) {
            return;
        }
        if (this.enemies.length === 0) {
            this.spawnEnemies();
        }
        for (const runtime of this.enemies) {
            const brain = runtime.brain;
            if (brain.state === 'dead') {
                continue;
            }
            const previousState = brain.state;
            const action = brain.update({ player: snapshot.alive ? snapshot : null, blockers: this.blockers }, dt);
            if (brain.state === 'alert' && previousState !== 'alert') {
                this.eventBus?.emit('enemy.detected', {
                    enemyId: brain.id,
                    position: [brain.position.x, 0, brain.position.z]
                });
            }
            this.syncFigure(runtime);
            if (action.reloadStarted) {
                this.eventBus?.emit('weapon.reloadStarted', { weaponId: 'enemy-rifle' });
            }
            if (action.reloadCompleted) {
                this.eventBus?.emit('weapon.reloadCompleted', {
                    weaponId: 'enemy-rifle',
                    magazine: brain.magazine,
                    reserve: 0
                });
            }
            if (action.fire) {
                this.fireAtPlayer(runtime, snapshot);
            }
        }
        this.hudTimer += dt;
        if (this.hudTimer >= 0.25) {
            this.hudTimer = 0;
            this.updateHudText();
        }
    }

    dispose(): void {
        this.destroyEnemies();
        for (const cleanup of this.cleanups.splice(0)) {
            cleanup();
        }
        this.app = null;
        this.eventBus = null;
        this.stateMachine = null;
        this.playerProvider = null;
        this.graph = null;
    }

    /** The typed service interface: alive enemies as raycast targets. */
    getEnemyTargets(): readonly EnemyTargetSnapshot[] {
        return this.enemies
            .filter((runtime) => runtime.brain.state !== 'dead')
            .map((runtime) => ({
                id: runtime.brain.id,
                aabb: {
                    minX: runtime.brain.position.x - 0.3,
                    maxX: runtime.brain.position.x + 0.3,
                    minY: 0,
                    maxY: 2,
                    minZ: runtime.brain.position.z - 0.3,
                    maxZ: runtime.brain.position.z + 0.3
                }
            }));
    }

    private spawnEnemies(): void {
        if (this.app === null || this.graph === null) {
            return;
        }
        const patrolRoute: readonly Vec2[] = TEST_ARENA_PATROL_ROUTE.map((id) => {
            const waypoint = TEST_ARENA_WAYPOINTS.find((candidate) => candidate.id === id);
            return { x: waypoint?.x ?? 0, z: waypoint?.z ?? 0 };
        });
        const coverPoints: readonly Vec2[] = TEST_ARENA_WAYPOINTS.filter((waypoint) => waypoint.cover).map(
            (waypoint) => ({ x: waypoint.x, z: waypoint.z })
        );
        for (const spawn of TEST_ARENA_SPAWNS) {
            const brain = new EnemyBrain({
                id: spawn.id,
                definition: enemyDefinitionForDifficulty(GRUNT, DEFAULT_DIFFICULTY),
                spawn: { x: spawn.x, z: spawn.z },
                patrolRoute,
                coverPoints,
                graph: this.graph
            });
            const root = new PlayEntity(spawn.id);
            root.setPosition(spawn.x, 0, spawn.z);
            const torso = boxEntity(`${spawn.id}-torso`, 0.6, 0.9, 0.35, 0, 1.15, 0);
            const head = new PlayEntity(`${spawn.id}-head`);
            head.addComponent('render', { type: 'sphere' });
            head.setLocalScale(0.45, 0.45, 0.45);
            head.setLocalPosition(0, 1.85, 0);
            root.addChild(torso);
            root.addChild(head);
            const makeLimb = (name: string, x: number, isLeg: boolean): Entity => {
                const limb = new PlayEntity(name);
                limb.setLocalPosition(x, isLeg ? 0.75 : 1.45, 0);
                const mesh = boxEntity(`${name}-mesh`, 0.18, isLeg ? 0.75 : 0.7, 0.18, 0, isLeg ? -0.375 : -0.35, 0);
                limb.addChild(mesh);
                root.addChild(limb);
                return limb;
            };
            const leftLeg = makeLimb(`${spawn.id}-leg-left`, -0.2, true);
            const rightLeg = makeLimb(`${spawn.id}-leg-right`, 0.2, true);
            // Arms posed forward (aiming), not hanging: a forward swing
            // of the downward arm mesh points it along the facing axis.
            const leftArm = makeLimb(`${spawn.id}-arm-left`, -0.42, false);
            const rightArm = makeLimb(`${spawn.id}-arm-right`, 0.42, false);
            leftArm.setLocalEulerAngles(80, 0, 0);
            rightArm.setLocalEulerAngles(80, 0, 0);
            this.app.root.addChild(root);
            this.enemies.push({
                brain,
                root,
                leftLeg,
                rightLeg,
                spawn: { x: spawn.x, z: spawn.z },
                swingPhase: 0,
                previousX: spawn.x,
                previousZ: spawn.z
            });
            this.syncFigure(this.enemies[this.enemies.length - 1]);
        }
        this.updateHudText();
    }

    private destroyEnemies(): void {
        for (const runtime of this.enemies) {
            runtime.root.destroy();
        }
        this.enemies = [];
        const text = document.getElementById('hud-enemy-text');
        if (text !== null) {
            text.textContent = '';
        }
    }

    private resetOrSpawn(): void {
        const snapshot = this.playerProvider?.getPlayerSnapshot() ?? null;
        if (snapshot === null) {
            return;
        }
        if (this.enemies.length === 0) {
            this.spawnEnemies();
            return;
        }
        for (const runtime of this.enemies) {
            runtime.brain.reset(runtime.spawn);
            runtime.root.setLocalEulerAngles(0, (runtime.brain.yaw * 180) / Math.PI, 0);
            runtime.previousX = runtime.spawn.x;
            runtime.previousZ = runtime.spawn.z;
            this.syncFigure(runtime);
        }
        this.updateHudText();
    }

    private syncFigure(runtime: EnemyRuntime): void {
        const brain = runtime.brain;
        runtime.root.setPosition(brain.position.x, 0, brain.position.z);
        runtime.root.setLocalEulerAngles(0, (brain.yaw * 180) / Math.PI, 0);
        const moved = Math.hypot(brain.position.x - runtime.previousX, brain.position.z - runtime.previousZ);
        runtime.previousX = brain.position.x;
        runtime.previousZ = brain.position.z;
        if (moved > 0.001) {
            runtime.swingPhase += 0.35;
        }
        const swing = Math.sin(runtime.swingPhase) * 30;
        if (runtime.leftLeg !== null) {
            runtime.leftLeg.setLocalEulerAngles(swing, 0, 0);
        }
        if (runtime.rightLeg !== null) {
            runtime.rightLeg.setLocalEulerAngles(-swing, 0, 0);
        }
    }

    private onHitConfirmed(sourceId: string, targetId: string, damage: number): void {
        const runtime = this.enemies.find((candidate) => candidate.brain.id === targetId);
        if (runtime === undefined || runtime.brain.state === 'dead') {
            return;
        }
        const died = runtime.brain.applyHit(damage);
        if (!died) {
            return;
        }
        runtime.root.setLocalEulerAngles(-80, (runtime.brain.yaw * 180) / Math.PI, 0);
        this.eventBus?.emit('entity.died', {
            entityId: runtime.brain.id,
            entityType: 'enemy',
            killerId: sourceId,
            position: [runtime.brain.position.x, 0, runtime.brain.position.z]
        });
        this.updateHudText();
    }

    private onWeaponFired(ownerId: string, origin: readonly [number, number, number]): void {
        if (ownerId !== 'player') {
            return;
        }
        const shot: Vec2 = { x: origin[0], z: origin[2] };
        for (const runtime of this.enemies) {
            const brain = runtime.brain;
            if (
                (brain.state === 'patrol' || brain.state === 'idle') &&
                soundHeard(brain.position, shot, brain.definition.soundRange)
            ) {
                brain.hearShot(shot);
            }
        }
    }

    private fireAtPlayer(runtime: EnemyRuntime, snapshot: PlayerSnapshot): void {
        const brain = runtime.brain;
        const eye = { x: brain.position.x, y: 1.5, z: brain.position.z };
        const chest = { x: snapshot.x, y: snapshot.y + 1.2, z: snapshot.z };
        let direction = {
            x: chest.x - eye.x,
            y: chest.y - eye.y,
            z: chest.z - eye.z
        };
        const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
        direction = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
        // Difficulty accuracy lives in data: normal accuracy is 1.0, so
        // shipped enemies aim exactly at the chest and the geometric
        // raycast below decides the hit; lower accuracy adds error.
        const accuracy = DIFFICULTY_SCALES[DEFAULT_DIFFICULTY].accuracy;
        if (accuracy < 1) {
            const error = (1 - accuracy) * 0.15;
            direction = {
                x: direction.x + (Math.random() * 2 - 1) * error,
                y: direction.y + (Math.random() * 2 - 1) * error,
                z: direction.z
            };
            const errorLength = Math.hypot(direction.x, direction.y, direction.z) || 1;
            direction = {
                x: direction.x / errorLength,
                y: direction.y / errorLength,
                z: direction.z / errorLength
            };
        }
        this.shotCounter += 1;
        this.eventBus?.emit('weapon.fired', {
            ownerId: brain.id,
            weaponId: 'enemy-rifle',
            origin: [eye.x, eye.y, eye.z],
            direction: [direction.x, direction.y, direction.z],
            shotId: `enemy-shot-${this.shotCounter}`
        });
        const hit = raycastScene(
            eye,
            direction,
            brain.definition.attackRange,
            [
                {
                    id: 'player',
                    aabb: {
                        minX: snapshot.x - 0.3,
                        maxX: snapshot.x + 0.3,
                        minY: snapshot.y,
                        maxY: snapshot.y + 2,
                        minZ: snapshot.z - 0.3,
                        maxZ: snapshot.z + 0.3
                    }
                }
            ],
            this.blockers
        );
        if (hit.kind === 'target') {
            this.eventBus?.emit('combat.hitConfirmed', {
                sourceId: brain.id,
                targetId: 'player',
                hitZone: 'body',
                damage: brain.definition.damage,
                worldPosition: [hit.point.x, hit.point.y, hit.point.z]
            });
        }
    }

    private updateHudText(): void {
        const text = document.getElementById('hud-enemy-text');
        if (text === null) {
            return;
        }
        const parts: string[] = [];
        for (const [state, label] of STATE_LABELS) {
            const count = this.enemies.filter((runtime) => runtime.brain.state === state).length;
            if (count > 0) {
                parts.push(`${label} ${count}`);
            }
        }
        text.textContent = `Enemies ${this.enemies.length}${parts.length > 0 ? ` · ${parts.join(' · ')}` : ''}`;
    }
}
