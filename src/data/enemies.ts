/**
 * Enemy balance and test-arena data (SRS section 6-B, Build 3 gate).
 * Balancing lives in data, never in hard-coded conditionals in the brain:
 * the grunt definition below is the single source of truth, and difficulty
 * scaling is a data table applied to it (see enemyDefinitionForDifficulty).
 *
 * The arena crates and waypoints here are deliberately duplicated from
 * PlayerSystem's arena data, not imported from it: the enemy module must
 * not import anything from src/systems/player/ (SRS section 5, no
 * cross-system imports), and duplicating a dozen numbers is safer than a
 * hidden coupling between the two systems.
 */

export interface EnemyDefinition {
    readonly id: string;
    readonly name: string;
    /** Health in hit points. */
    readonly health: number;
    /** Patrol / investigate / take-cover speed in m/s. */
    readonly patrolSpeed: number;
    /** Chase speed in m/s. */
    readonly chaseSpeed: number;
    /** Perception range in metres (strictly less than this counts as in range). */
    readonly perceptionRange: number;
    /** Full field-of-view cone in degrees. */
    readonly fovDegrees: number;
    /** Firing range in metres. */
    readonly attackRange: number;
    /** Seconds between shots. */
    readonly fireIntervalSeconds: number;
    /** Damage per hit. */
    readonly damage: number;
    /** Shots before a reload. */
    readonly magazineSize: number;
    /** Reload duration in seconds. */
    readonly reloadSeconds: number;
    /** Alert -> Chase delay in seconds. */
    readonly reactionSeconds: number;
    /** Investigate duration in seconds before giving up back to Patrol. */
    readonly investigateSeconds: number;
    /** Stun duration in seconds after a non-lethal hit. */
    readonly stunSeconds: number;
    /** Distance in metres within which a gunshot is heard. */
    readonly soundRange: number;
}

export const GRUNT: EnemyDefinition = {
    id: 'grunt',
    name: 'Grunt',
    health: 100,
    patrolSpeed: 1.6,
    chaseSpeed: 3.2,
    perceptionRange: 20,
    fovDegrees: 100,
    attackRange: 12,
    fireIntervalSeconds: 0.8,
    damage: 8,
    magazineSize: 12,
    reloadSeconds: 2.0,
    reactionSeconds: 0.4,
    investigateSeconds: 3,
    stunSeconds: 0.4,
    soundRange: 20
};

export interface DifficultyScale {
    /** Multiplier applied to the base damage. */
    readonly damageMultiplier: number;
    /** Multiplier applied to the base reaction delay. */
    readonly reactionMultiplier: number;
    /** 1.0 is perfect aim; lower values add a random aim error in the system. */
    readonly accuracy: number;
}

export const DIFFICULTY_SCALES: Readonly<Record<'easy' | 'normal' | 'hard', DifficultyScale>> = {
    easy: { damageMultiplier: 0.75, reactionMultiplier: 1.5, accuracy: 0.8 },
    normal: { damageMultiplier: 1, reactionMultiplier: 1, accuracy: 1 },
    hard: { damageMultiplier: 1.25, reactionMultiplier: 0.75, accuracy: 1 }
};

export type Difficulty = keyof typeof DIFFICULTY_SCALES;

export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

/** Returns a copy of the base definition scaled by the difficulty table. */
export function enemyDefinitionForDifficulty(base: EnemyDefinition, difficulty: Difficulty): EnemyDefinition {
    const scale = DIFFICULTY_SCALES[difficulty];
    return {
        ...base,
        damage: Math.round(base.damage * scale.damageMultiplier),
        reactionSeconds: base.reactionSeconds * scale.reactionMultiplier
    };
}

export interface ArenaWaypoint {
    readonly id: string;
    readonly x: number;
    readonly z: number;
    /** True for waypoints beside a crate, used as cover positions. */
    readonly cover: boolean;
}

/**
 * Test-arena waypoint graph. The first eight points form a loop around the
 * arena, clear of every crate; the four cover points sit beside crates.
 * Loop order is the patrol route, starting at the north-west corner.
 */
export const TEST_ARENA_WAYPOINTS: readonly ArenaWaypoint[] = [
    { id: 'nw', x: -16, z: -16, cover: false },
    { id: 'n', x: 0, z: -16, cover: false },
    { id: 'ne', x: 16, z: -16, cover: false },
    { id: 'e', x: 16, z: 0, cover: false },
    { id: 'se', x: 16, z: 16, cover: false },
    { id: 's', x: 0, z: 16, cover: false },
    { id: 'sw', x: -16, z: 16, cover: false },
    { id: 'w', x: -16, z: 0, cover: false },
    { id: 'cover-a', x: -4, z: -6, cover: true },
    { id: 'cover-b', x: 4, z: -2, cover: true },
    { id: 'cover-c', x: -6, z: 7, cover: true },
    { id: 'cover-d', x: 10, z: 3, cover: true }
];

export const TEST_ARENA_PATROL_ROUTE: readonly string[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface ArenaCrate {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
    readonly top: number;
}

/** The five test-arena crates, same numbers as PlayerSystem's CRATES. */
export const TEST_ARENA_CRATES: readonly ArenaCrate[] = [
    { minX: 5, maxX: 7, minZ: -5, maxZ: -3, top: 1.2 },
    { minX: -9, maxX: -6, minZ: 2, maxZ: 5, top: 2 },
    { minX: -2, maxX: 2, minZ: -10, maxZ: -8, top: 1 },
    { minX: 8, maxX: 11, minZ: 6, maxZ: 9, top: 2.5 },
    { minX: -13, maxX: -11, minZ: -12, maxZ: -9, top: 1.5 }
];

export interface EnemySpawn {
    readonly id: string;
    readonly x: number;
    readonly z: number;
}

/**
 * The three test-arena enemies. Each is exactly 20 m or more from the
 * player spawn (0, 6) — enemy-3 at (0, -14) sits exactly on the 20 m
 * perception boundary, and perception is strictly less-than, so a
 * stationary player at spawn is not detected. This protects the existing
 * arena e2e test, which never walks far enough, fast enough, for an
 * enemy to close in and land a hit before its assertions pass.
 */
export const TEST_ARENA_SPAWNS: readonly EnemySpawn[] = [
    { id: 'enemy-1', x: -16, z: -16 },
    { id: 'enemy-2', x: 16, z: -16 },
    { id: 'enemy-3', x: 0, z: -14 }
];
