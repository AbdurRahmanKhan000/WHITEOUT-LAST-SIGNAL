import type { EnemyDefinition } from '../../data/enemies';
import { applyDamage } from '../../services/DamageService';
import type { Aabb3 } from '../../services/raycast';

import { transitionEnemyState } from './EnemyStateMachine';
import type { EnemyState } from './EnemyStateMachine';
import type { NavigationGraph, GraphPoint } from './NavigationGraph';
import { canSee, distance2D, yawForDirection } from './Perception';
import type { Vec2 } from './Perception';

/**
 * Pure enemy brain (SRS section 6-B, Build 3 gate).
 * One brain owns one enemy's runtime state — position, yaw, FSM state,
 * timers, ammo and path — and decides each tick from senses alone. It
 * has no PlayCanvas types, no EventBus and no DOM access, so it is fully
 * unit-testable; EnemySystem is the thin adapter that turns its actions
 * into scene movement and bus events.
 *
 * GREYBOX PLACEHOLDER, stated plainly: the brain drives a boxes-and-
 * sphere figure owned by EnemySystem. It is NOT a realistic rigged
 * character, and no SRS animation clips are met by Build 3.
 */

export interface BrainSenses {
    /** The player snapshot, or null when there is no arena / player. */
    readonly player: { readonly x: number; readonly y: number; readonly z: number } | null;
    /** Crate and wall boxes, used for line of sight and collision. */
    readonly blockers: readonly Aabb3[];
}

export interface BrainAction {
    readonly fire: boolean;
    readonly reloadStarted: boolean;
    readonly reloadCompleted: boolean;
}

export interface EnemyBrainOptions {
    readonly id: string;
    readonly definition: EnemyDefinition;
    readonly spawn: Vec2;
    /** Patrol loop points, in walking order. */
    readonly patrolRoute: readonly Vec2[];
    readonly coverPoints: readonly Vec2[];
    readonly graph: NavigationGraph;
}

const ENEMY_RADIUS = 0.45;
const ARENA_HALF = 20;
const EYE_HEIGHT = 1.5;
const TURN_RATE_RADIANS_PER_SECOND = 6;

function clampArena(value: number): number {
    return Math.max(-ARENA_HALF + ENEMY_RADIUS, Math.min(ARENA_HALF - ENEMY_RADIUS, value));
}

function circleHitsBox(x: number, z: number, radius: number, box: Aabb3): boolean {
    const closestX = Math.max(box.minX, Math.min(x, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    return dx * dx + dz * dz < radius * radius;
}

function collides(x: number, z: number, blockers: readonly Aabb3[]): boolean {
    return blockers.some((box) => circleHitsBox(x, z, ENEMY_RADIUS, box));
}

/** Axis-separated circle movement: full step, then each axis alone (wall sliding). */
function moveWithCollisions(position: Vec2, delta: Vec2, blockers: readonly Aabb3[]): Vec2 {
    const candidate: Vec2 = { x: clampArena(position.x + delta.x), z: clampArena(position.z + delta.z) };
    if (!collides(candidate.x, candidate.z, blockers)) {
        return candidate;
    }
    const onlyX: Vec2 = { x: candidate.x, z: position.z };
    if (!collides(onlyX.x, onlyX.z, blockers)) {
        return onlyX;
    }
    const onlyZ: Vec2 = { x: position.x, z: candidate.z };
    if (!collides(onlyZ.x, onlyZ.z, blockers)) {
        return onlyZ;
    }
    return position;
}

export class EnemyBrain {
    readonly id: string;
    readonly definition: EnemyDefinition;
    position: Vec2;
    yaw: number;
    state: EnemyState = 'patrol';
    health: number;
    magazine: number;
    /** Counts FSM transitions; the multi-brain test bounds this (no churn). */
    stateChanges = 0;

    private readonly patrolRoute: readonly Vec2[];
    private readonly coverPoints: readonly Vec2[];
    private readonly graph: NavigationGraph;
    private cooldown = 0;
    private reloading = false;
    private reloadTimer = 0;
    private reactionTimer = 0;
    private investigateTimer = 0;
    private stunTimer = 0;
    private stunResume: EnemyState = 'patrol';
    private losLostTimer = 0;
    private patrolIndex = 0;
    private lastKnown: Vec2 | null = null;
    private path: readonly GraphPoint[] = [];
    private pathIndex = 0;
    private pathGoal: Vec2 | null = null;
    private pathTimer = 0;
    private moveMode: 'direct' | 'graph' | 'sidestep' | 'none' = 'direct';
    private sidestepTarget: Vec2 | null = null;
    private stuckTimer = 0;
    private hasTakenCover = false;
    private coverTarget: Vec2 | null = null;

    constructor(options: EnemyBrainOptions) {
        this.id = options.id;
        this.definition = options.definition;
        this.patrolRoute = options.patrolRoute;
        this.coverPoints = options.coverPoints;
        this.graph = options.graph;
        this.position = { x: options.spawn.x, z: options.spawn.z };
        // Sentries start facing the arena centre, not their first
        // waypoint: a patrolling enemy that only looked where it walked
        // would take a full loop to notice a player near the centre.
        this.yaw = yawForDirection(-options.spawn.x, -options.spawn.z);
        this.health = options.definition.health;
        this.magazine = options.definition.magazineSize;
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < this.patrolRoute.length; i += 1) {
            const distance = distance2D(options.spawn, this.patrolRoute[i]);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = i;
            }
        }
        this.patrolIndex = nearestIndex;
    }

    /** Resets the brain to its spawn state (arena restart). */
    reset(spawn: Vec2): void {
        this.position = { x: spawn.x, z: spawn.z };
        this.yaw = yawForDirection(-spawn.x, -spawn.z);
        this.state = 'patrol';
        this.health = this.definition.health;
        this.magazine = this.definition.magazineSize;
        this.cooldown = 0;
        this.reloading = false;
        this.reloadTimer = 0;
        this.reactionTimer = 0;
        this.investigateTimer = 0;
        this.stunTimer = 0;
        this.losLostTimer = 0;
        this.lastKnown = null;
        this.path = [];
        this.pathIndex = 0;
        this.pathGoal = null;
        this.pathTimer = 0;
        this.moveMode = 'direct';
        this.sidestepTarget = null;
        this.stuckTimer = 0;
        this.hasTakenCover = false;
        this.coverTarget = null;
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < this.patrolRoute.length; i += 1) {
            const distance = distance2D(spawn, this.patrolRoute[i]);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = i;
            }
        }
        this.patrolIndex = nearestIndex;
    }

    /** Applies a hit through DamageService. Returns true when it killed. */
    applyHit(damage: number): boolean {
        if (this.state === 'dead') {
            return false;
        }
        const outcome = applyDamage(this.health, damage);
        this.health = outcome.health;
        if (outcome.died) {
            this.setState(transitionEnemyState(this.state, { type: 'hit', lethal: true }));
            return true;
        }
        if (this.state !== 'stunned') {
            this.stunResume = this.state;
        }
        this.stunTimer = this.definition.stunSeconds;
        this.setState(transitionEnemyState(this.state, { type: 'hit', lethal: false }));
        return false;
    }

    /** A gunshot heard while patrolling sends the enemy to investigate it. */
    hearShot(origin: Vec2): void {
        if (this.state !== 'patrol' && this.state !== 'idle') {
            return;
        }
        this.lastKnown = { x: origin.x, z: origin.z };
        this.investigateTimer = this.definition.investigateSeconds;
        this.setState(transitionEnemyState(this.state, { type: 'soundHeard' }));
        this.recomputePath(this.lastKnown);
        this.moveMode = 'graph';
    }

    update(senses: BrainSenses, dt: number): BrainAction {
        const noAction: BrainAction = { fire: false, reloadStarted: false, reloadCompleted: false };
        if (dt <= 0 || this.state === 'dead') {
            return noAction;
        }
        if (this.cooldown > 0) {
            this.cooldown = Math.max(0, this.cooldown - dt);
        }
        let reloadCompleted = false;
        if (this.reloading) {
            this.reloadTimer -= dt;
            if (this.reloadTimer <= 0) {
                this.reloading = false;
                this.magazine = this.definition.magazineSize;
                reloadCompleted = true;
            }
        }

        // Perception: seeing the player refreshes the last known position.
        const player = senses.player;
        const seen =
            player !== null &&
            canSee({
                enemy: this.position,
                enemyYaw: this.yaw,
                eyeHeight: EYE_HEIGHT,
                target: { x: player.x, z: player.z },
                targetHeight: player.y + 1.2,
                perceptionRange: this.definition.perceptionRange,
                fovDegrees: this.definition.fovDegrees,
                blockers: senses.blockers
            });
        if (seen && player !== null) {
            const previousKnown = this.lastKnown;
            this.lastKnown = { x: player.x, z: player.z };
            this.losLostTimer = 0;
            // A player who moved well away invalidates a graph repath:
            // chase directly again instead of following a stale path.
            if (this.state === 'chase' && previousKnown !== null && distance2D(previousKnown, this.lastKnown) > 1) {
                this.moveMode = 'direct';
                this.path = [];
                this.pathGoal = null;
            }
        }

        let moveTarget: Vec2 | null = null;
        let faceTarget: Vec2 | null = null;
        let speed = this.definition.patrolSpeed;
        let reloadStarted = false;

        switch (this.state) {
            case 'patrol': {
                if (seen) {
                    this.reactionTimer = this.definition.reactionSeconds;
                    this.setState(transitionEnemyState(this.state, { type: 'seen' }));
                    faceTarget = this.lastKnown;
                    break;
                }
                const waypoint = this.patrolRoute[this.patrolIndex];
                if (waypoint !== undefined && distance2D(this.position, waypoint) < 0.4) {
                    this.patrolIndex = (this.patrolIndex + 1) % this.patrolRoute.length;
                }
                moveTarget = this.patrolRoute[this.patrolIndex] ?? null;
                // Patrol facing is the arena centre (see constructor):
                // the sentry watches the ground it guards while walking.
                faceTarget = { x: 0, z: 0 };
                break;
            }
            case 'investigate': {
                if (seen) {
                    this.reactionTimer = this.definition.reactionSeconds;
                    this.setState(transitionEnemyState(this.state, { type: 'seen' }));
                    faceTarget = this.lastKnown;
                    break;
                }
                this.investigateTimer -= dt;
                if (this.investigateTimer <= 0) {
                    this.setState(transitionEnemyState(this.state, { type: 'investigateExpired' }));
                    this.patrolIndex = this.nearestPatrolIndex();
                    break;
                }
                moveTarget = this.followPathTarget(this.lastKnown, dt);
                faceTarget = moveTarget ?? this.lastKnown;
                break;
            }
            case 'alert': {
                faceTarget = this.lastKnown;
                this.reactionTimer -= dt;
                if (this.reactionTimer <= 0) {
                    this.setState(transitionEnemyState(this.state, { type: 'reactionElapsed' }));
                }
                break;
            }
            case 'chase': {
                speed = this.definition.chaseSpeed;
                if (seen && player !== null) {
                    if (distance2D(this.position, { x: player.x, z: player.z }) <= this.definition.attackRange) {
                        this.setState(transitionEnemyState(this.state, { type: 'inRange' }));
                        faceTarget = this.lastKnown;
                        break;
                    }
                    faceTarget = this.lastKnown;
                    moveTarget = this.chaseTarget(player, dt);
                    break;
                }
                this.losLostTimer += dt;
                if (this.losLostTimer > 1) {
                    this.investigateTimer = this.definition.investigateSeconds;
                    this.setState(transitionEnemyState(this.state, { type: 'losLost' }));
                    if (this.lastKnown !== null) {
                        this.recomputePath(this.lastKnown);
                        this.moveMode = 'graph';
                    }
                    break;
                }
                faceTarget = this.lastKnown;
                moveTarget = this.lastKnown !== null ? this.chaseTarget(this.lastKnown, dt) : null;
                break;
            }
            case 'attack': {
                faceTarget = this.lastKnown;
                if (seen && player !== null) {
                    if (distance2D(this.position, { x: player.x, z: player.z }) > this.definition.attackRange) {
                        this.setState(transitionEnemyState(this.state, { type: 'outOfRange' }));
                        speed = this.definition.chaseSpeed;
                        moveTarget = this.chaseTarget(player, dt);
                        break;
                    }
                    if (
                        this.health < this.definition.health * 0.4 &&
                        !this.hasTakenCover &&
                        this.coverPoints.length > 0
                    ) {
                        this.hasTakenCover = true;
                        this.coverTarget = this.nearestPoint(this.coverPoints);
                        this.setState(transitionEnemyState(this.state, { type: 'lowHealth' }));
                        if (this.coverTarget !== null) {
                            this.recomputePath(this.coverTarget);
                            this.moveMode = 'graph';
                        }
                        break;
                    }
                    break;
                }
                this.losLostTimer += dt;
                if (this.losLostTimer > 1) {
                    this.investigateTimer = this.definition.investigateSeconds;
                    this.setState(transitionEnemyState(this.state, { type: 'losLost' }));
                    if (this.lastKnown !== null) {
                        this.recomputePath(this.lastKnown);
                        this.moveMode = 'graph';
                    }
                }
                break;
            }
            case 'takeCover': {
                if (this.coverTarget !== null) {
                    if (distance2D(this.position, this.coverTarget) < 0.5) {
                        this.setState(transitionEnemyState(this.state, { type: 'coverReached' }));
                        faceTarget = this.lastKnown;
                        break;
                    }
                    moveTarget = this.followPathTarget(this.coverTarget, dt);
                    faceTarget = moveTarget ?? this.lastKnown;
                }
                break;
            }
            case 'stunned': {
                this.stunTimer -= dt;
                if (this.stunTimer <= 0) {
                    this.setState(transitionEnemyState(this.state, { type: 'stunExpired', resume: this.stunResume }));
                }
                break;
            }
            case 'idle':
                // 'dead' cannot reach here: update() returns early for it.
                break;
        }

        // Low health also interrupts a chase (the attack branch above
        // covers Attack; this covers Chase without duplicating the move).
        if (
            this.state === 'chase' &&
            this.health < this.definition.health * 0.4 &&
            !this.hasTakenCover &&
            this.coverPoints.length > 0
        ) {
            this.hasTakenCover = true;
            this.coverTarget = this.nearestPoint(this.coverPoints);
            this.setState(transitionEnemyState(this.state, { type: 'lowHealth' }));
            if (this.coverTarget !== null) {
                this.recomputePath(this.coverTarget);
                this.moveMode = 'graph';
            }
            moveTarget = null;
            faceTarget = this.lastKnown;
        }

        if (faceTarget !== null && distance2D(this.position, faceTarget) > 1e-6) {
            this.turnToward(faceTarget, dt);
        }

        // Movement with "stop when blocked": a direct move that makes no
        // progress for a second first sidesteps around the blocking crate
        // (local steering — far cheaper than a loop-graph detour when the
        // player stands just past a crate); a sidestep that still makes
        // no progress repaths once over the graph; a graph move that
        // still makes no progress stops in place instead of pushing
        // through the obstacle.
        let moved = 0;
        if (moveTarget !== null && distance2D(this.position, moveTarget) > 0.3) {
            const before = { x: this.position.x, z: this.position.z };
            const dx = moveTarget.x - this.position.x;
            const dz = moveTarget.z - this.position.z;
            const length = Math.hypot(dx, dz) || 1;
            const step = Math.min(speed * dt, length);
            this.position = moveWithCollisions(
                this.position,
                { x: (dx / length) * step, z: (dz / length) * step },
                senses.blockers
            );
            moved = distance2D(before, this.position);
            if (moved < 0.25 * step && step > 0.01) {
                this.stuckTimer += dt;
            } else {
                this.stuckTimer = 0;
            }
            if (this.stuckTimer >= 1) {
                this.stuckTimer = 0;
                if (this.moveMode === 'direct' && moveTarget !== null) {
                    const sidestep = this.computeSidestep(moveTarget, senses.blockers);
                    if (sidestep !== null) {
                        this.sidestepTarget = sidestep;
                        this.moveMode = 'sidestep';
                    } else if (this.lastKnown !== null) {
                        this.moveMode = 'graph';
                        this.recomputePath(this.lastKnown);
                    } else {
                        this.moveMode = 'none';
                    }
                } else if (this.moveMode === 'sidestep' && this.lastKnown !== null) {
                    this.sidestepTarget = null;
                    this.moveMode = 'graph';
                    this.recomputePath(this.lastKnown);
                } else {
                    this.moveMode = 'none';
                }
            }
        } else {
            this.stuckTimer = 0;
        }

        // Firing: only from Attack, on cooldown, in range, with line of
        // sight and a round in the magazine. The system re-checks the
        // geometry before emitting the hit; the brain decides to shoot.
        let fire = false;
        if (
            this.state === 'attack' &&
            seen &&
            player !== null &&
            distance2D(this.position, { x: player.x, z: player.z }) <= this.definition.attackRange &&
            !this.reloading &&
            this.cooldown <= 0 &&
            this.magazine > 0
        ) {
            fire = true;
            this.magazine -= 1;
            this.cooldown = this.definition.fireIntervalSeconds;
            if (this.magazine <= 0) {
                this.reloading = true;
                this.reloadTimer = this.definition.reloadSeconds;
                reloadStarted = true;
            }
        }
        return { fire, reloadStarted, reloadCompleted };
    }

    private setState(next: EnemyState): void {
        if (next !== this.state) {
            this.state = next;
            this.stateChanges += 1;
            // A state change invalidates any in-progress path: the next
            // state recomputes its own path from its own goal.
            this.moveMode = 'direct';
            this.sidestepTarget = null;
            this.path = [];
            this.pathGoal = null;
            this.stuckTimer = 0;
        }
    }

    private nearestPatrolIndex(): number {
        let best = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < this.patrolRoute.length; i += 1) {
            const distance = distance2D(this.position, this.patrolRoute[i]);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = i;
            }
        }
        return best;
    }

    private nearestPoint(points: readonly Vec2[]): Vec2 | null {
        let best: Vec2 | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const point of points) {
            const distance = distance2D(this.position, point);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = point;
            }
        }
        return best;
    }

    private recomputePath(goal: Vec2): void {
        this.path = this.graph.findPath(this.position, goal);
        this.pathIndex = 0;
        this.pathGoal = { x: goal.x, z: goal.z };
        this.pathTimer = 0.5;
    }

    /** Next movement target while following a graph path (NFR-14 throttle). */
    private followPathTarget(goal: Vec2 | null, dt: number): Vec2 | null {
        if (goal === null) {
            return null;
        }
        if (this.moveMode === 'none') {
            return null;
        }
        this.pathTimer -= dt;
        // Throttled (NFR-14): recompute only when there is no path yet,
        // or when the 0.5 s throttle has elapsed while following a graph
        // path. A moving goal does not force a recompute — the final leg
        // always walks directly to the current goal once the path ends.
        if (this.pathGoal === null || (this.pathTimer <= 0 && this.moveMode === 'graph')) {
            this.recomputePath(goal);
            this.moveMode = 'graph';
        }
        if (this.moveMode !== 'graph') {
            return goal;
        }
        while (this.pathIndex < this.path.length) {
            const waypoint = this.path[this.pathIndex];
            if (distance2D(this.position, waypoint) < 0.4) {
                this.pathIndex += 1;
                continue;
            }
            return waypoint;
        }
        return goal;
    }

    /** Chase target: direct, sidestep, or graph path depending on moveMode. */
    private chaseTarget(goal: Vec2, dt: number): Vec2 | null {
        if (this.moveMode === 'none') {
            return null;
        }
        if (this.moveMode === 'sidestep') {
            if (this.sidestepTarget !== null && distance2D(this.position, this.sidestepTarget) < 0.5) {
                this.sidestepTarget = null;
                this.moveMode = 'direct';
                return goal;
            }
            return this.sidestepTarget;
        }
        if (this.moveMode === 'graph') {
            return this.followPathTarget(goal, dt);
        }
        return goal;
    }

    private pointInExpandedBox(point: Vec2, box: Aabb3): boolean {
        return (
            point.x >= box.minX - ENEMY_RADIUS &&
            point.x <= box.maxX + ENEMY_RADIUS &&
            point.z >= box.minZ - ENEMY_RADIUS &&
            point.z <= box.maxZ + ENEMY_RADIUS
        );
    }

    /** First blocker (expanded by the enemy radius) sampled along a segment. */
    private segmentBlocker(from: Vec2, to: Vec2, blockers: readonly Aabb3[]): Aabb3 | null {
        const length = distance2D(from, to);
        if (length < 1e-9) {
            return null;
        }
        for (let distance = 0.25; distance < length; distance += 0.25) {
            const point = {
                x: from.x + ((to.x - from.x) * distance) / length,
                z: from.z + ((to.z - from.z) * distance) / length
            };
            for (const box of blockers) {
                if (this.pointInExpandedBox(point, box)) {
                    return box;
                }
            }
        }
        return null;
    }

    /**
     * Local steering around a blocking crate: the nearest expanded corner
     * that is itself clear and reachable by a sampled-clear segment.
     * Corners are offset 0.9 m so the walk to them does not graze the box.
     */
    private computeSidestep(toward: Vec2, blockers: readonly Aabb3[]): Vec2 | null {
        const blocker = this.segmentBlocker(this.position, toward, blockers);
        if (blocker === null) {
            return null;
        }
        const corners: readonly Vec2[] = [
            { x: blocker.minX - 0.9, z: blocker.minZ - 0.9 },
            { x: blocker.maxX + 0.9, z: blocker.minZ - 0.9 },
            { x: blocker.minX - 0.9, z: blocker.maxZ + 0.9 },
            { x: blocker.maxX + 0.9, z: blocker.maxZ + 0.9 }
        ];
        const sorted = [...corners].sort((a, b) => distance2D(this.position, a) - distance2D(this.position, b));
        for (const candidate of sorted) {
            if (Math.abs(candidate.x) > ARENA_HALF || Math.abs(candidate.z) > ARENA_HALF) {
                continue;
            }
            if (blockers.some((box) => this.pointInExpandedBox(candidate, box))) {
                continue;
            }
            if (this.segmentBlocker(this.position, candidate, blockers) === null) {
                return candidate;
            }
        }
        return null;
    }

    private turnToward(target: Vec2, dt: number): void {
        const targetYaw = yawForDirection(target.x - this.position.x, target.z - this.position.z);
        let diff = targetYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxStep = TURN_RATE_RADIANS_PER_SECOND * dt;
        this.yaw += Math.max(-maxStep, Math.min(maxStep, diff));
    }
}
