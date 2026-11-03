import { describe, expect, it } from 'vitest';

import {
    GRUNT,
    TEST_ARENA_CRATES,
    TEST_ARENA_PATROL_ROUTE,
    TEST_ARENA_SPAWNS,
    TEST_ARENA_WAYPOINTS
} from '../../src/data/enemies';
import type { Aabb3 } from '../../src/services/raycast';
import { EnemyBrain } from '../../src/systems/enemy/EnemyBrain';
import { transitionEnemyState } from '../../src/systems/enemy/EnemyStateMachine';
import { NavigationGraph } from '../../src/systems/enemy/NavigationGraph';
import { canSee, distance2D, soundHeard, yawForDirection } from '../../src/systems/enemy/Perception';

const BLOCKERS: readonly Aabb3[] = TEST_ARENA_CRATES.map((crate) => ({
    minX: crate.minX,
    maxX: crate.maxX,
    minY: 0,
    maxY: crate.top,
    minZ: crate.minZ,
    maxZ: crate.maxZ
}));

const PATROL_ROUTE = TEST_ARENA_PATROL_ROUTE.map((id) => {
    const waypoint = TEST_ARENA_WAYPOINTS.find((candidate) => candidate.id === id);
    return { x: waypoint?.x ?? 0, z: waypoint?.z ?? 0 };
});

const COVER_POINTS = TEST_ARENA_WAYPOINTS.filter((waypoint) => waypoint.cover).map((waypoint) => ({
    x: waypoint.x,
    z: waypoint.z
}));

function makeGraph(): NavigationGraph {
    return new NavigationGraph(
        TEST_ARENA_WAYPOINTS.map((waypoint) => ({ id: waypoint.id, x: waypoint.x, z: waypoint.z })),
        TEST_ARENA_CRATES
    );
}

function makeBrain(spawn: { x: number; z: number } = { x: 0, z: -14 }, id = 'enemy-3'): EnemyBrain {
    return new EnemyBrain({
        id,
        definition: GRUNT,
        spawn,
        patrolRoute: PATROL_ROUTE,
        coverPoints: COVER_POINTS,
        graph: makeGraph()
    });
}

function tick(brain: EnemyBrain, player: { x: number; y: number; z: number } | null, dt: number, count: number) {
    let action = brain.update({ player, blockers: BLOCKERS }, dt);
    for (let i = 1; i < count; i += 1) {
        action = brain.update({ player, blockers: BLOCKERS }, dt);
    }
    return action;
}

describe('Perception', () => {
    // Enemy at (0, -14) facing the arena centre (+Z, yaw PI).
    const enemy = { x: 0, z: -14 };
    const yaw = yawForDirection(0, 14);

    it('sees a target in range, in FOV and with a clear line of sight', () => {
        expect(
            canSee({
                enemy,
                enemyYaw: yaw,
                eyeHeight: 1.5,
                target: { x: 0, z: -5 },
                targetHeight: 1.2,
                perceptionRange: 20,
                fovDegrees: 100,
                blockers: BLOCKERS
            })
        ).toBe(true);
    });

    it('does not see a target beyond perception range', () => {
        expect(
            canSee({
                enemy,
                enemyYaw: yaw,
                eyeHeight: 1.5,
                target: { x: 0, z: 7 },
                targetHeight: 1.2,
                perceptionRange: 20,
                fovDegrees: 100,
                blockers: BLOCKERS
            })
        ).toBe(false);
    });

    it('does not see a target exactly on the perception boundary', () => {
        expect(
            canSee({
                enemy,
                enemyYaw: yaw,
                eyeHeight: 1.5,
                target: { x: 0, z: 6 },
                targetHeight: 1.2,
                perceptionRange: 20,
                fovDegrees: 100,
                blockers: BLOCKERS
            })
        ).toBe(false);
    });

    it('does not see a target behind it', () => {
        expect(
            canSee({
                enemy,
                enemyYaw: yaw,
                eyeHeight: 1.5,
                target: { x: 0, z: -18 },
                targetHeight: 1.2,
                perceptionRange: 20,
                fovDegrees: 100,
                blockers: BLOCKERS
            })
        ).toBe(false);
    });

    it('does not see a target behind a tall crate box', () => {
        const tallBlocker: readonly Aabb3[] = [{ minX: -1, maxX: 1, minY: 0, maxY: 3, minZ: -10, maxZ: -8 }];
        expect(
            canSee({
                enemy,
                enemyYaw: yaw,
                eyeHeight: 1.5,
                target: { x: 0, z: -5 },
                targetHeight: 1.2,
                perceptionRange: 20,
                fovDegrees: 100,
                blockers: tallBlocker
            })
        ).toBe(false);
    });

    it('hears a shot within sound range but not beyond it', () => {
        expect(soundHeard(enemy, { x: 0, z: 0 }, 20)).toBe(true);
        expect(soundHeard(enemy, { x: 0, z: 10 }, 20)).toBe(false);
    });
});

describe('EnemyStateMachine', () => {
    it('Patrol -> Alert on seen, Alert -> Chase after reaction, Chase -> Attack in range', () => {
        expect(transitionEnemyState('patrol', { type: 'seen' })).toBe('alert');
        expect(transitionEnemyState('alert', { type: 'reactionElapsed' })).toBe('chase');
        expect(transitionEnemyState('chase', { type: 'inRange' })).toBe('attack');
    });

    it('Attack -> Investigate on LOS lost, Investigate -> Patrol on timer expiry', () => {
        expect(transitionEnemyState('attack', { type: 'losLost' })).toBe('investigate');
        expect(transitionEnemyState('investigate', { type: 'investigateExpired' })).toBe('patrol');
    });

    it('any combat state -> Stunned on a non-lethal hit, any state -> Dead on a lethal hit', () => {
        for (const state of ['patrol', 'investigate', 'alert', 'chase', 'attack', 'takeCover'] as const) {
            expect(transitionEnemyState(state, { type: 'hit', lethal: false })).toBe('stunned');
            expect(transitionEnemyState(state, { type: 'hit', lethal: true })).toBe('dead');
        }
    });

    it('Dead is terminal and an event with no transition leaves the state unchanged', () => {
        expect(transitionEnemyState('dead', { type: 'seen' })).toBe('dead');
        expect(transitionEnemyState('patrol', { type: 'inRange' })).toBe('patrol');
        expect(transitionEnemyState('stunned', { type: 'stunExpired', resume: 'attack' })).toBe('attack');
    });

    it('low health sends Chase and Attack to cover, reaching cover resumes Attack', () => {
        expect(transitionEnemyState('chase', { type: 'lowHealth' })).toBe('takeCover');
        expect(transitionEnemyState('attack', { type: 'lowHealth' })).toBe('takeCover');
        expect(transitionEnemyState('takeCover', { type: 'coverReached' })).toBe('attack');
    });
});

describe('NavigationGraph', () => {
    it('routes around a crate instead of through it, with no repeated waypoints', () => {
        const graph = makeGraph();
        const path = graph.findPath({ x: -6, z: -9 }, { x: 6, z: -9 });
        expect(path.length).toBeGreaterThanOrEqual(2);
        const last = path[path.length - 1];
        expect(last.x).toBe(6);
        expect(last.z).toBe(-9);
        const keys = path.map((point) => `${point.x},${point.z}`);
        expect(new Set(keys).size).toBe(keys.length);
        // No path point sits inside the expanded centre crate.
        for (const point of path) {
            const insideCrate = point.x >= -2.5 && point.x <= 2.5 && point.z >= -10.5 && point.z <= -7.5;
            expect(insideCrate).toBe(false);
        }
    });

    it('returns an empty path for an unreachable goal inside a crate or outside the arena', () => {
        const graph = makeGraph();
        expect(graph.findPath({ x: -6, z: -9 }, { x: 0, z: -9 })).toEqual([]);
        expect(graph.findPath({ x: -6, z: -9 }, { x: 25, z: 0 })).toEqual([]);
    });

    it('returns a direct path when the segment is clear', () => {
        const graph = makeGraph();
        expect(graph.findPath({ x: -16, z: -16 }, { x: 16, z: -16 })).toEqual([{ x: 16, z: -16 }]);
    });

    it('still paths from a crate-face position whose centre touches the expanded box', () => {
        // Regression: an enemy stopped against the centre crate sits at
        // (0, -10.45)-ish, inside the 0.5 m expanded crate box, so a slab
        // test would reject every edge leaving it. Sampling lets it out.
        const graph = makeGraph();
        const path = graph.findPath({ x: 0, z: -10.45 }, { x: 0, z: -16 });
        expect(path.length).toBeGreaterThanOrEqual(1);
        const last = path[path.length - 1];
        expect(last.x).toBe(0);
        expect(last.z).toBe(-16);
    });
});

describe('EnemyBrain', () => {
    it('patrol advances along waypoints', () => {
        const brain = makeBrain();
        tick(brain, null, 0.1, 20);
        expect(brain.state).toBe('patrol');
        expect(brain.position.z).toBeCloseTo(-16, 0);
        expect(brain.position.x).toBeGreaterThan(0.5);
    });

    it('chase moves toward the player', () => {
        const brain = makeBrain();
        const player = { x: 0, y: 0, z: 2 };
        const startDistance = distance2D(brain.position, player);
        tick(brain, player, 0.1, 15);
        expect(brain.state).toBe('chase');
        expect(distance2D(brain.position, player)).toBeLessThan(startDistance - 2);
    });

    it('attack fires only on cooldown and within range', () => {
        const brain = makeBrain();
        const player = { x: 0, y: 0, z: -5 };
        let action = brain.update({ player, blockers: BLOCKERS }, 0.1);
        for (let i = 0; i < 10 && brain.state !== 'attack'; i += 1) {
            action = brain.update({ player, blockers: BLOCKERS }, 0.1);
        }
        expect(brain.state).toBe('attack');
        expect(action.fire).toBe(true);
        expect(brain.magazine).toBe(11);
        expect(brain.update({ player, blockers: BLOCKERS }, 0.1).fire).toBe(false);
        let firedAgain = false;
        for (let i = 0; i < 8; i += 1) {
            if (brain.update({ player, blockers: BLOCKERS }, 0.1).fire) {
                firedAgain = true;
            }
        }
        expect(firedAgain).toBe(true);
    });

    it('attack does not fire out of range', () => {
        const brain = makeBrain();
        const player = { x: 0, y: 0, z: 2 };
        const action = tick(brain, player, 0.1, 10);
        expect(brain.state).toBe('chase');
        expect(action.fire).toBe(false);
    });

    it('reload blocks firing until the magazine is refilled', () => {
        const brain = makeBrain();
        const player = { x: 0, y: 0, z: -5 };
        let started = false;
        let completed = false;
        let firedDuringReload = false;
        for (let i = 0; i < 400 && !completed; i += 1) {
            const action = brain.update({ player, blockers: BLOCKERS }, 0.1);
            if (action.reloadCompleted) {
                completed = true;
            } else if (action.reloadStarted) {
                started = true;
            } else if (started && action.fire) {
                firedDuringReload = true;
            }
        }
        expect(started).toBe(true);
        expect(completed).toBe(true);
        expect(firedDuringReload).toBe(false);
        expect(brain.magazine).toBe(11);
    });

    it('chase sidesteps around a crate instead of stalling at its face', () => {
        const brain = makeBrain();
        const player = { x: 0, y: 0, z: 4.4 };
        // Drive to the chase: alert, then north until the centre crate
        // stops the enemy at its north face, then around it.
        tick(brain, player, 0.1, 60);
        expect(Math.abs(brain.position.x)).toBeGreaterThan(0.5);
        // The sidestep must actually close the fight: Attack within 100
        // ticks total. A loop-graph detour would need ~190 ticks of
        // travel for the same route, so this timing proves the local
        // steering, not just eventual arrival.
        tick(brain, player, 0.1, 40);
        expect(brain.state).toBe('attack');
    });

    it('a heard shot sends Patrol to Investigate, and the timer returns it to Patrol', () => {
        const brain = makeBrain();
        brain.hearShot({ x: 0, z: 0 });
        expect(brain.state).toBe('investigate');
        tick(brain, null, 0.1, 35);
        expect(brain.state).toBe('patrol');
    });

    it('a non-lethal hit stuns and then resumes the previous state', () => {
        const brain = makeBrain();
        const player = { x: 0, y: 0, z: -5 };
        tick(brain, player, 0.1, 10);
        expect(brain.state).toBe('attack');
        expect(brain.applyHit(10)).toBe(false);
        expect(brain.state).toBe('stunned');
        expect(brain.health).toBe(90);
        tick(brain, player, 0.1, 5);
        expect(brain.state).toBe('attack');
    });

    it('a lethal hit kills and Dead stays dead', () => {
        const brain = makeBrain();
        expect(brain.applyHit(100)).toBe(true);
        expect(brain.state).toBe('dead');
        expect(brain.applyHit(10)).toBe(false);
        tick(brain, null, 0.1, 10);
        expect(brain.state).toBe('dead');
    });

    it('simulates 1, 3 and 8 brains for 10 seconds with no crash and bounded churn', () => {
        const spawnPool = [
            ...TEST_ARENA_SPAWNS,
            { id: 'extra-1', x: -16, z: 16 },
            { id: 'extra-2', x: 16, z: 16 },
            { id: 'extra-3', x: 0, z: 16 },
            { id: 'extra-4', x: -16, z: 0 },
            { id: 'extra-5', x: 16, z: 0 }
        ];
        const player = { x: 0, y: 0, z: 0 };
        for (const count of [1, 3, 8]) {
            const brains = spawnPool.slice(0, count).map((spawn) => makeBrain({ x: spawn.x, z: spawn.z }, spawn.id));
            for (let i = 0; i < 600; i += 1) {
                for (const brain of brains) {
                    brain.update({ player, blockers: BLOCKERS }, 1 / 60);
                }
            }
            for (const brain of brains) {
                expect(Math.abs(brain.position.x)).toBeLessThanOrEqual(19.6);
                expect(Math.abs(brain.position.z)).toBeLessThanOrEqual(19.6);
                for (const crate of TEST_ARENA_CRATES) {
                    const inside =
                        brain.position.x > crate.minX - 0.4 &&
                        brain.position.x < crate.maxX + 0.4 &&
                        brain.position.z > crate.minZ - 0.4 &&
                        brain.position.z < crate.maxZ + 0.4;
                    expect(inside).toBe(false);
                }
                expect(brain.stateChanges).toBeLessThan(50);
            }
            expect(brains.some((brain) => brain.state === 'attack')).toBe(true);
        }
    });
});
