/**
 * Build 5 — data-driven level records (SRS sections 8, 12.1, Build 5 gate),
 * extended in Build 6 to Levels 11-20 and in Build 7 to Levels 21-30.
 * One record per level; no 30 separate logic files. All 30 levels are
 * fully playable; there are no locked summaries left.
 *
 * Reused geometry: every level runs in the test-arena geometry
 * (40x40 m, same crates/walls/waypoint graph). Levels differ in player
 * spawn, enemy spawn groups, objective zones, time limits, ammo reserve
 * and environment tint — not in maps. Greybox figures remain greybox.
 * Level 22's rooftops and sniper position are a reach + eliminate
 * objective pair in that geometry, not a rooftop map; Level 18's
 * stranded operative was the same kind of honest stand-in.
 */

import type { EnemyVariant } from './enemies';

export type StageName =
    'Training' | 'Operations' | 'Combat Zone' | 'Special Operations' | 'Final Campaign' | 'Final Showdown';
export type DifficultyName = 'Easy' | 'Moderate' | 'Hard' | 'Very Hard' | 'Extreme' | 'Elite';
export type ObjectiveType = 'eliminate' | 'activate' | 'reach' | 'survive' | 'defend';
export type PatrolMode = 'loop' | 'stationary';

export interface ZoneDefinition {
    readonly id: string;
    readonly x: number;
    readonly z: number;
    /** Square zone side length in metres. */
    readonly size: number;
}

export interface ObjectiveDefinition {
    readonly id: string;
    readonly type: ObjectiveType;
    readonly label: string;
    /** Defend only: HUD label for the hold phase after activation. */
    readonly defendLabel?: string;
    /** Eliminate: the group to clear, or 'all' for every enemy. */
    readonly targetGroupId?: string;
    /** Eliminate: how many kills complete it (default: all in group). */
    readonly count?: number;
    readonly zone?: ZoneDefinition;
    /** Activate/defend: seconds of continuous dwell in the zone. */
    readonly dwellSeconds?: number;
    /** Survive/defend: seconds to hold after activation (defend) or from start (survive). */
    readonly surviveSeconds?: number;
    /** If set, the mission fails when this objective is still incomplete after this many seconds. */
    readonly timeLimitSeconds?: number;
}

export interface EnemyGroupDefinition {
    readonly id: string;
    /** The objective this group belongs to (eliminate groups); empty for free waves. */
    readonly objectiveId: string;
    /** Spawn this group only when this group has been fully cleared. */
    readonly waveAfter?: string;
    /** Enemy variant for the whole group (default 'grunt'). */
    readonly variant?: EnemyVariant;
    readonly patrolMode: PatrolMode;
    readonly spawns: readonly { readonly id: string; readonly x: number; readonly z: number }[];
}

export interface CheckpointDefinition {
    readonly id: string;
    /** Null = level start; otherwise the objective whose completion creates this checkpoint. */
    readonly afterObjectiveId: string | null;
}

export interface EnvironmentTint {
    readonly clear: readonly [number, number, number];
    readonly lightIntensity: number;
}

export interface LevelRecord {
    readonly id: number;
    readonly name: string;
    readonly stage: StageName;
    readonly difficulty: DifficultyName;
    readonly environmentId: string;
    readonly environment: string;
    readonly playerSpawn: { readonly x: number; readonly z: number };
    readonly enemySpawnGroups: readonly EnemyGroupDefinition[];
    readonly objectives: readonly ObjectiveDefinition[];
    readonly checkpointDefinitions: readonly CheckpointDefinition[];
    readonly musicCue: string;
    readonly completionRules: { readonly parSeconds: number };
    readonly nextLevelId: number | null;
    /** Rifle reserve for this level (default 120 when absent). */
    readonly rifleReserve?: number;
    /** Multiplier on enemy perception range (Level 12 reduced visibility: 0.6). */
    readonly perceptionMultiplier?: number;
    readonly environmentTint: EnvironmentTint;
}

export interface MissionStartPayload {
    readonly levelId: number;
    readonly name: string;
    readonly playerSpawn: { readonly x: number; readonly z: number };
    readonly rifleReserve: number;
    readonly perceptionMultiplier: number;
    readonly groups: readonly EnemyGroupDefinition[];
    readonly zones: readonly ZoneDefinition[];
    readonly environmentTint: EnvironmentTint;
    readonly objectiveLabel: string;
}

export interface CatalogEntry {
    readonly id: number;
    readonly name: string;
    readonly stage: StageName;
    readonly environment: string;
    readonly objectiveSummary: string;
    readonly playable: boolean;
    readonly difficulty?: DifficultyName;
    readonly comingIn?: string;
}

const TRAINING_TINT: EnvironmentTint = { clear: [0.043, 0.086, 0.149], lightIntensity: 1 };
const YARD_TINT: EnvironmentTint = { clear: [0.03, 0.04, 0.06], lightIntensity: 0.9 };
const OUTPOST_TINT: EnvironmentTint = { clear: [0.08, 0.06, 0.05], lightIntensity: 0.95 };
const INDUSTRIAL_TINT: EnvironmentTint = { clear: [0.02, 0.05, 0.05], lightIntensity: 0.85 };
const DESERT_TINT: EnvironmentTint = { clear: [0.12, 0.09, 0.05], lightIntensity: 1.1 };
const URBAN_EDGE_TINT: EnvironmentTint = { clear: [0.05, 0.05, 0.08], lightIntensity: 0.9 };
const CITY_TINT: EnvironmentTint = { clear: [0.03, 0.03, 0.04], lightIntensity: 0.8 };
const HUB_TINT: EnvironmentTint = { clear: [0.04, 0.06, 0.1], lightIntensity: 1 };
const SNOW_TINT: EnvironmentTint = { clear: [0.06, 0.08, 0.11], lightIntensity: 1.0 };
const SNOW_DARK_TINT: EnvironmentTint = { clear: [0.01, 0.02, 0.03], lightIntensity: 0.7 };
const FACILITY_TINT: EnvironmentTint = { clear: [0.02, 0.03, 0.05], lightIntensity: 0.85 };
const TUNNEL_TINT: EnvironmentTint = { clear: [0.01, 0.02, 0.02], lightIntensity: 0.75 };
const ROOFTOP_TINT: EnvironmentTint = { clear: [0.04, 0.05, 0.09], lightIntensity: 0.9 };
const TERMINAL_TINT: EnvironmentTint = { clear: [0.04, 0.04, 0.06], lightIntensity: 0.9 };
const COMMAND_TINT: EnvironmentTint = { clear: [0.03, 0.04, 0.08], lightIntensity: 0.9 };
const TOWER_TINT: EnvironmentTint = { clear: [0.06, 0.05, 0.03], lightIntensity: 0.95 };
const FORTRESS_TINT: EnvironmentTint = { clear: [0.05, 0.02, 0.02], lightIntensity: 0.85 };
const CONTROL_TINT: EnvironmentTint = { clear: [0.01, 0.03, 0.06], lightIntensity: 0.8 };

function checkpointsFor(objectives: readonly ObjectiveDefinition[]): readonly CheckpointDefinition[] {
    return [
        { id: 'cp-start', afterObjectiveId: null },
        ...objectives.map((objective) => ({ id: `cp-${objective.id}`, afterObjectiveId: objective.id }))
    ];
}

export const LEVELS: readonly LevelRecord[] = [
    {
        id: 1,
        name: 'First Contact',
        stage: 'Training',
        difficulty: 'Easy',
        environmentId: 'training-range',
        environment: 'Training range',
        playerSpawn: { x: 0, z: 6 },
        enemySpawnGroups: [
            {
                id: 'l1-sentries',
                objectiveId: 'l1-eliminate',
                patrolMode: 'stationary',
                spawns: [
                    { id: 'l1-e1', x: 0, z: -2 },
                    { id: 'l1-e2', x: 0, z: -8 },
                    { id: 'l1-e3', x: 0, z: -14 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l1-eliminate',
                type: 'eliminate',
                label: 'Eliminate all 3 stationary targets',
                targetGroupId: 'l1-sentries',
                count: 3
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l1-eliminate', type: 'eliminate', label: 'Eliminate all 3 stationary targets' }
        ]),
        musicCue: 'training',
        completionRules: { parSeconds: 180 },
        nextLevelId: 2,
        environmentTint: TRAINING_TINT
    },
    {
        id: 2,
        name: 'Live Fire',
        stage: 'Training',
        difficulty: 'Easy',
        environmentId: 'training-range',
        environment: 'Training range',
        playerSpawn: { x: 0, z: 6 },
        enemySpawnGroups: [
            {
                id: 'l2-patrol',
                objectiveId: 'l2-eliminate',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l2-e1', x: -16, z: -16 },
                    { id: 'l2-e2', x: 16, z: -16 },
                    { id: 'l2-e3', x: 0, z: -14 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l2-eliminate',
                type: 'eliminate',
                label: 'Defeat the patrol (3 enemies)',
                targetGroupId: 'l2-patrol',
                count: 3
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l2-eliminate', type: 'eliminate', label: 'Defeat the patrol (3 enemies)' }
        ]),
        musicCue: 'training',
        completionRules: { parSeconds: 240 },
        nextLevelId: 3,
        environmentTint: TRAINING_TINT
    },
    {
        id: 3,
        name: 'Field Test',
        stage: 'Training',
        difficulty: 'Easy',
        environmentId: 'industrial-yard',
        environment: 'Industrial yard',
        playerSpawn: { x: 0, z: 6 },
        enemySpawnGroups: [
            {
                id: 'l3-guard',
                objectiveId: 'l3-eliminate',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l3-e1', x: -10, z: -10 },
                    { id: 'l3-e2', x: 10, z: -10 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l3-eliminate',
                type: 'eliminate',
                label: 'Clear the yard guards (2 enemies)',
                targetGroupId: 'l3-guard',
                count: 2
            },
            {
                id: 'l3-extract',
                type: 'reach',
                label: 'Reach the extraction marker in 120 s',
                zone: { id: 'l3-zone', x: 16, z: 16, size: 4 },
                timeLimitSeconds: 120
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l3-eliminate', type: 'eliminate', label: 'Clear the yard guards (2 enemies)' },
            { id: 'l3-extract', type: 'reach', label: 'Reach the extraction marker in 120 s' }
        ]),
        musicCue: 'training',
        completionRules: { parSeconds: 180 },
        nextLevelId: 4,
        environmentTint: YARD_TINT
    },
    {
        id: 4,
        name: 'Broken Perimeter',
        stage: 'Operations',
        difficulty: 'Moderate',
        environmentId: 'military-outpost',
        environment: 'Military outpost',
        playerSpawn: { x: 0, z: 10 },
        enemySpawnGroups: [
            {
                id: 'l4-first',
                objectiveId: 'l4-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l4-e1', x: -16, z: -16 },
                    { id: 'l4-e2', x: 0, z: -16 },
                    { id: 'l4-e3', x: 16, z: -16 }
                ]
            },
            {
                id: 'l4-second',
                objectiveId: 'l4-second',
                waveAfter: 'l4-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l4-e4', x: -16, z: 0 },
                    { id: 'l4-e5', x: 16, z: 0 },
                    { id: 'l4-e6', x: 0, z: -8 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l4-first',
                type: 'eliminate',
                label: 'Clear the first perimeter group (3 enemies)',
                targetGroupId: 'l4-first',
                count: 3
            },
            {
                id: 'l4-second',
                type: 'eliminate',
                label: 'Clear the second wave (3 enemies)',
                targetGroupId: 'l4-second',
                count: 3
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l4-first', type: 'eliminate', label: 'Clear the first perimeter group (3 enemies)' },
            { id: 'l4-second', type: 'eliminate', label: 'Clear the second wave (3 enemies)' }
        ]),
        musicCue: 'combat',
        completionRules: { parSeconds: 300 },
        nextLevelId: 5,
        environmentTint: OUTPOST_TINT
    },
    {
        id: 5,
        name: 'Relay Station',
        stage: 'Operations',
        difficulty: 'Moderate',
        environmentId: 'industrial-zone',
        environment: 'Industrial zone',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l5-guard',
                objectiveId: '',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l5-e1', x: -12, z: -12 },
                    { id: 'l5-e2', x: 12, z: -12 },
                    { id: 'l5-e3', x: 0, z: -16 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l5-activate',
                type: 'activate',
                label: 'Stand in the relay zone for 3 s to activate it',
                zone: { id: 'l5-zone', x: 0, z: -10, size: 4 },
                dwellSeconds: 3
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l5-activate', type: 'activate', label: 'Stand in the relay zone for 3 s to activate it' }
        ]),
        musicCue: 'combat',
        completionRules: { parSeconds: 240 },
        nextLevelId: 6,
        environmentTint: INDUSTRIAL_TINT
    },
    {
        id: 6,
        name: 'Blackout',
        stage: 'Operations',
        difficulty: 'Moderate',
        environmentId: 'industrial-zone',
        environment: 'Industrial zone',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l6-first',
                objectiveId: '',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l6-e1', x: -14, z: -14 },
                    { id: 'l6-e2', x: 14, z: -14 },
                    { id: 'l6-e3', x: 0, z: -16 }
                ]
            },
            {
                id: 'l6-second',
                objectiveId: '',
                waveAfter: 'l6-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l6-e4', x: -14, z: 0 },
                    { id: 'l6-e5', x: 14, z: 0 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l6-first',
                type: 'activate',
                label: 'Activate control point A (stand in the zone 3 s)',
                zone: { id: 'l6-zone-a', x: -12, z: -10, size: 4 },
                dwellSeconds: 3
            },
            {
                id: 'l6-second',
                type: 'activate',
                label: 'Activate control point B (stand in the zone 3 s)',
                zone: { id: 'l6-zone-b', x: 12, z: -10, size: 4 },
                dwellSeconds: 3
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l6-first', type: 'activate', label: 'Activate control point A (stand in the zone 3 s)' },
            { id: 'l6-second', type: 'activate', label: 'Activate control point B (stand in the zone 3 s)' }
        ]),
        musicCue: 'tense',
        completionRules: { parSeconds: 300 },
        nextLevelId: 7,
        environmentTint: INDUSTRIAL_TINT
    },
    {
        id: 7,
        name: 'Supply Route',
        stage: 'Operations',
        difficulty: 'Moderate',
        environmentId: 'desert-outpost',
        environment: 'Desert outpost',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l7-blockade',
                objectiveId: 'l7-eliminate',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l7-e1', x: -12, z: -12 },
                    { id: 'l7-e2', x: 0, z: -14 },
                    { id: 'l7-e3', x: 12, z: -12 },
                    { id: 'l7-e4', x: 0, z: -6 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l7-eliminate',
                type: 'eliminate',
                label: 'Clear the blockade (4 enemies)',
                targetGroupId: 'l7-blockade',
                count: 4
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l7-eliminate', type: 'eliminate', label: 'Clear the blockade (4 enemies)' }
        ]),
        musicCue: 'combat',
        completionRules: { parSeconds: 300 },
        nextLevelId: 8,
        environmentTint: DESERT_TINT
    },
    {
        id: 8,
        name: 'Extraction Window',
        stage: 'Operations',
        difficulty: 'Moderate',
        environmentId: 'urban-edge',
        environment: 'Urban edge',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l8-first',
                objectiveId: '',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l8-e1', x: -14, z: -14 },
                    { id: 'l8-e2', x: 14, z: -14 },
                    { id: 'l8-e3', x: 0, z: -16 }
                ]
            },
            {
                id: 'l8-second',
                objectiveId: '',
                waveAfter: 'l8-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l8-e4', x: -14, z: 0 },
                    { id: 'l8-e5', x: 14, z: 0 },
                    { id: 'l8-e6', x: 0, z: -8 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l8-survive',
                type: 'survive',
                label: 'Survive the wave for 60 s',
                surviveSeconds: 60
            },
            {
                id: 'l8-extract',
                type: 'reach',
                label: 'Reach the extraction zone',
                zone: { id: 'l8-zone', x: 14, z: 14, size: 4 }
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l8-survive', type: 'survive', label: 'Survive the wave for 60 s' },
            { id: 'l8-extract', type: 'reach', label: 'Reach the extraction zone' }
        ]),
        musicCue: 'tense',
        completionRules: { parSeconds: 180 },
        nextLevelId: 9,
        environmentTint: URBAN_EDGE_TINT
    },
    {
        id: 9,
        name: 'Silent Streets',
        stage: 'Combat Zone',
        difficulty: 'Hard',
        environmentId: 'abandoned-city',
        environment: 'Abandoned city',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l9-patrol',
                objectiveId: 'l9-eliminate',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l9-e1', x: -14, z: -14 },
                    { id: 'l9-e2', x: 0, z: -16 },
                    { id: 'l9-e3', x: 14, z: -14 },
                    { id: 'l9-e4', x: -8, z: -4 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l9-eliminate',
                type: 'eliminate',
                label: 'Clear the street patrols (4 enemies, limited ammo)',
                targetGroupId: 'l9-patrol',
                count: 4
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l9-eliminate', type: 'eliminate', label: 'Clear the street patrols (4 enemies, limited ammo)' }
        ]),
        musicCue: 'tense',
        completionRules: { parSeconds: 300 },
        nextLevelId: 10,
        rifleReserve: 60,
        environmentTint: CITY_TINT
    },
    {
        id: 10,
        name: 'Signal Recovery',
        stage: 'Combat Zone',
        difficulty: 'Hard',
        environmentId: 'urban-hub',
        environment: 'Urban communications hub',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l10-first',
                objectiveId: '',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l10-e1', x: -14, z: -14 },
                    { id: 'l10-e2', x: 14, z: -14 },
                    { id: 'l10-e3', x: 0, z: -16 }
                ]
            },
            {
                id: 'l10-second',
                objectiveId: '',
                waveAfter: 'l10-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l10-e4', x: -14, z: 0 },
                    { id: 'l10-e5', x: 14, z: 0 },
                    { id: 'l10-e6', x: 0, z: -8 }
                ]
            },
            {
                id: 'l10-third',
                objectiveId: '',
                waveAfter: 'l10-second',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l10-e7', x: -10, z: -10 },
                    { id: 'l10-e8', x: 10, z: -10 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l10-defend',
                type: 'defend',
                label: 'Activate the transmitter (3 s), then defend it for 30 s',
                zone: { id: 'l10-zone', x: 0, z: -12, size: 4 },
                dwellSeconds: 3,
                surviveSeconds: 30
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l10-defend', type: 'defend', label: 'Activate the transmitter (3 s), then defend it for 30 s' }
        ]),
        musicCue: 'final',
        completionRules: { parSeconds: 240 },
        nextLevelId: 11,
        environmentTint: HUB_TINT
    },
    {
        id: 11,
        name: 'Frozen Entry',
        stage: 'Combat Zone',
        difficulty: 'Hard',
        environmentId: 'snow-base',
        environment: 'Snow base',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l11-first',
                objectiveId: 'l11-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l11-e1', x: -14, z: -14 },
                    { id: 'l11-e2', x: 0, z: -16 },
                    { id: 'l11-e3', x: 14, z: -14 }
                ]
            },
            {
                id: 'l11-second',
                objectiveId: 'l11-second',
                waveAfter: 'l11-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l11-e4', x: -14, z: 0 },
                    { id: 'l11-e5', x: 14, z: 0 },
                    { id: 'l11-e6', x: 0, z: -8 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l11-first',
                type: 'eliminate',
                label: 'Clear the entry checkpoint guards (3 enemies)',
                targetGroupId: 'l11-first',
                count: 3
            },
            {
                id: 'l11-second',
                type: 'eliminate',
                label: 'Clear the reinforcing patrol (3 enemies)',
                targetGroupId: 'l11-second',
                count: 3
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l11-first', type: 'eliminate', label: 'Clear the entry checkpoint guards (3 enemies)' },
            { id: 'l11-second', type: 'eliminate', label: 'Clear the reinforcing patrol (3 enemies)' }
        ]),
        musicCue: 'combat',
        completionRules: { parSeconds: 360 },
        nextLevelId: 12,
        environmentTint: SNOW_TINT
    },
    {
        id: 12,
        name: 'Whiteout Patrol',
        stage: 'Combat Zone',
        difficulty: 'Hard',
        environmentId: 'snow-base',
        environment: 'Snow base',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l12-first',
                objectiveId: 'l12-first',
                variant: 'scout',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l12-e1', x: -14, z: -14 },
                    { id: 'l12-e2', x: 0, z: -16 },
                    { id: 'l12-e3', x: 14, z: -14 },
                    { id: 'l12-e4', x: -8, z: -4 }
                ]
            },
            {
                id: 'l12-second',
                objectiveId: 'l12-second',
                variant: 'scout',
                waveAfter: 'l12-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l12-e5', x: -14, z: 0 },
                    { id: 'l12-e6', x: 14, z: 0 },
                    { id: 'l12-e7', x: 0, z: -8 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l12-first',
                type: 'eliminate',
                label: 'Track and defeat the first patrol (4 scouts, reduced visibility)',
                targetGroupId: 'l12-first',
                count: 4
            },
            {
                id: 'l12-second',
                type: 'eliminate',
                label: 'Defeat the second patrol (3 scouts)',
                targetGroupId: 'l12-second',
                count: 3
            }
        ],
        checkpointDefinitions: checkpointsFor([
            {
                id: 'l12-first',
                type: 'eliminate',
                label: 'Track and defeat the first patrol (4 scouts, reduced visibility)'
            },
            { id: 'l12-second', type: 'eliminate', label: 'Defeat the second patrol (3 scouts)' }
        ]),
        musicCue: 'tense',
        completionRules: { parSeconds: 420 },
        nextLevelId: 13,
        perceptionMultiplier: 0.6,
        environmentTint: SNOW_DARK_TINT
    },
    {
        id: 13,
        name: 'Cold Storage',
        stage: 'Combat Zone',
        difficulty: 'Hard',
        environmentId: 'snow-base-interior',
        environment: 'Snow base interior',
        // Spawn on the edge of the generator zone (size 8, centred at
        // z -12, so z -8 is inside): the player starts at the
        // generator and holds it, instead of walking through a small
        // zone and resetting the dwell timer by leaving it.
        playerSpawn: { x: 0, z: -8 },
        enemySpawnGroups: [
            {
                id: 'l13-guard',
                objectiveId: '',
                patrolMode: 'stationary',
                spawns: [
                    { id: 'l13-e1', x: -16, z: 8 },
                    { id: 'l13-e2', x: 16, z: 8 },
                    { id: 'l13-e3', x: 0, z: 16 }
                ]
            },
            {
                id: 'l13-wave',
                objectiveId: '',
                waveAfter: 'l13-guard',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l13-e4', x: -14, z: -14 },
                    { id: 'l13-e5', x: 14, z: -14 },
                    { id: 'l13-e6', x: 0, z: -16 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l13-defend',
                type: 'defend',
                label: 'Activate the backup generator (stand in the zone 3 s), then defend the room for 45 s',
                defendLabel: 'Defend the generator room for 45 s',
                zone: { id: 'l13-zone', x: 0, z: -12, size: 8 },
                dwellSeconds: 3,
                surviveSeconds: 45
            }
        ],
        checkpointDefinitions: checkpointsFor([
            {
                id: 'l13-defend',
                type: 'defend',
                label: 'Activate the backup generator (stand in the zone 3 s), then defend the room for 45 s'
            }
        ]),
        musicCue: 'tense',
        completionRules: { parSeconds: 240 },
        nextLevelId: 14,
        environmentTint: SNOW_TINT
    },
    {
        id: 14,
        name: 'Convoy Intercept',
        stage: 'Combat Zone',
        difficulty: 'Hard',
        environmentId: 'snow-road',
        environment: 'Snow road',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l14-roadblock',
                objectiveId: 'l14-roadblock',
                patrolMode: 'stationary',
                spawns: [
                    { id: 'l14-e1', x: -8, z: -12 },
                    { id: 'l14-e2', x: 0, z: -14 },
                    { id: 'l14-e3', x: 8, z: -12 }
                ]
            },
            {
                id: 'l14-escorts',
                objectiveId: 'l14-escorts',
                variant: 'scout',
                waveAfter: 'l14-roadblock',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l14-e4', x: -14, z: -14 },
                    { id: 'l14-e5', x: 14, z: -14 },
                    { id: 'l14-e6', x: 0, z: -8 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l14-roadblock',
                type: 'eliminate',
                label: 'Disable the hostile roadblock (3 enemies)',
                targetGroupId: 'l14-roadblock',
                count: 3
            },
            {
                id: 'l14-escorts',
                type: 'eliminate',
                label: 'Clear the escorting scouts (3 enemies)',
                targetGroupId: 'l14-escorts',
                count: 3
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l14-roadblock', type: 'eliminate', label: 'Disable the hostile roadblock (3 enemies)' },
            { id: 'l14-escorts', type: 'eliminate', label: 'Clear the escorting scouts (3 enemies)' }
        ]),
        musicCue: 'combat',
        completionRules: { parSeconds: 360 },
        nextLevelId: 15,
        environmentTint: SNOW_TINT
    },
    {
        id: 15,
        name: 'Last Outpost',
        stage: 'Combat Zone',
        difficulty: 'Hard',
        environmentId: 'snow-base-perimeter',
        environment: 'Snow base perimeter',
        playerSpawn: { x: 0, z: 10 },
        enemySpawnGroups: [
            {
                id: 'l15-first',
                objectiveId: '',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l15-e1', x: -14, z: -14 },
                    { id: 'l15-e2', x: 0, z: -16 },
                    { id: 'l15-e3', x: 14, z: -14 }
                ]
            },
            {
                id: 'l15-second',
                objectiveId: '',
                waveAfter: 'l15-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l15-e4', x: -14, z: 0 },
                    { id: 'l15-e5', x: 14, z: 0 },
                    { id: 'l15-e6', x: -8, z: -8 },
                    { id: 'l15-e7', x: 8, z: -8 }
                ]
            },
            {
                id: 'l15-heavy',
                objectiveId: '',
                variant: 'heavy',
                waveAfter: 'l15-second',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l15-e8', x: -12, z: -12 },
                    { id: 'l15-e9', x: 0, z: -14 },
                    { id: 'l15-e10', x: 12, z: -12 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l15-defend',
                type: 'defend',
                label: 'Activate the outpost beacon (stand in the zone 3 s), then defend the outpost for 60 s',
                defendLabel: 'Defend the outpost for 60 s',
                zone: { id: 'l15-zone', x: 0, z: 0, size: 4 },
                dwellSeconds: 3,
                surviveSeconds: 60
            }
        ],
        checkpointDefinitions: checkpointsFor([
            {
                id: 'l15-defend',
                type: 'defend',
                label: 'Activate the outpost beacon (stand in the zone 3 s), then defend the outpost for 60 s'
            }
        ]),
        musicCue: 'final',
        completionRules: { parSeconds: 300 },
        nextLevelId: 16,
        environmentTint: SNOW_TINT
    },
    {
        id: 16,
        name: 'Black Facility',
        stage: 'Special Operations',
        difficulty: 'Very Hard',
        environmentId: 'secret-facility',
        environment: 'Secret facility',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l16-guard',
                objectiveId: '',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l16-e1', x: -14, z: -14 },
                    { id: 'l16-e2', x: 14, z: -14 },
                    { id: 'l16-e3', x: 0, z: -16 }
                ]
            },
            {
                id: 'l16-wave',
                objectiveId: '',
                waveAfter: 'l16-guard',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l16-e4', x: -14, z: 0 },
                    { id: 'l16-e5', x: 14, z: 0 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l16-first',
                type: 'activate',
                label: 'Disable security terminal A (stand in the zone 3 s)',
                zone: { id: 'l16-zone-a', x: -12, z: -10, size: 4 },
                dwellSeconds: 3
            },
            {
                id: 'l16-second',
                type: 'activate',
                label: 'Disable security terminal B (stand in the zone 3 s)',
                zone: { id: 'l16-zone-b', x: 12, z: -10, size: 4 },
                dwellSeconds: 3
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l16-first', type: 'activate', label: 'Disable security terminal A (stand in the zone 3 s)' },
            { id: 'l16-second', type: 'activate', label: 'Disable security terminal B (stand in the zone 3 s)' }
        ]),
        musicCue: 'tense',
        completionRules: { parSeconds: 360 },
        nextLevelId: 17,
        environmentTint: FACILITY_TINT
    },
    {
        id: 17,
        name: 'Power Core',
        stage: 'Special Operations',
        difficulty: 'Very Hard',
        environmentId: 'underground-facility',
        environment: 'Underground facility',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l17-guard',
                objectiveId: '',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l17-e1', x: -14, z: -14 },
                    { id: 'l17-e2', x: 14, z: -14 },
                    { id: 'l17-e3', x: 0, z: -16 },
                    { id: 'l17-e4', x: -8, z: -4 }
                ]
            },
            {
                id: 'l17-wave',
                objectiveId: '',
                variant: 'heavy',
                waveAfter: 'l17-guard',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l17-e5', x: -10, z: -10 },
                    { id: 'l17-e6', x: 10, z: -10 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l17-reach',
                type: 'reach',
                label: 'Reach the power chamber',
                zone: { id: 'l17-zone-reach', x: -14, z: -14, size: 4 }
            },
            {
                id: 'l17-deactivate',
                type: 'activate',
                label: 'Deactivate the core (stand in the zone 3 s)',
                zone: { id: 'l17-zone-core', x: -14, z: -14, size: 4 },
                dwellSeconds: 3
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l17-reach', type: 'reach', label: 'Reach the power chamber' },
            { id: 'l17-deactivate', type: 'activate', label: 'Deactivate the core (stand in the zone 3 s)' }
        ]),
        musicCue: 'tense',
        completionRules: { parSeconds: 360 },
        nextLevelId: 18,
        environmentTint: FACILITY_TINT
    },
    {
        id: 18,
        name: 'Personnel Recovery',
        stage: 'Special Operations',
        difficulty: 'Very Hard',
        environmentId: 'research-wing',
        environment: 'Research wing',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l18-guard',
                objectiveId: '',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l18-e1', x: -14, z: -14 },
                    { id: 'l18-e2', x: 14, z: -14 },
                    { id: 'l18-e3', x: 0, z: -16 },
                    { id: 'l18-e4', x: -8, z: -4 }
                ]
            },
            {
                id: 'l18-wave',
                objectiveId: '',
                variant: 'scout',
                waveAfter: 'l18-guard',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l18-e5', x: -14, z: 0 },
                    { id: 'l18-e6', x: 14, z: 0 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l18-reach',
                type: 'reach',
                label: 'Reach the stranded operative (marker) and extract them',
                zone: { id: 'l18-zone', x: -16, z: -16, size: 4 }
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l18-reach', type: 'reach', label: 'Reach the stranded operative (marker) and extract them' }
        ]),
        musicCue: 'tense',
        completionRules: { parSeconds: 300 },
        nextLevelId: 19,
        environmentTint: FACILITY_TINT
    },
    {
        id: 19,
        name: 'Data Vault',
        stage: 'Special Operations',
        difficulty: 'Very Hard',
        environmentId: 'secret-facility',
        environment: 'Secret facility',
        playerSpawn: { x: 0, z: 10 },
        enemySpawnGroups: [
            {
                id: 'l19-first',
                objectiveId: '',
                variant: 'heavy',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l19-e1', x: -14, z: -14 },
                    { id: 'l19-e2', x: 0, z: -16 },
                    { id: 'l19-e3', x: 14, z: -14 }
                ]
            },
            {
                id: 'l19-second',
                objectiveId: '',
                variant: 'heavy',
                waveAfter: 'l19-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l19-e4', x: -14, z: 0 },
                    { id: 'l19-e5', x: 14, z: 0 },
                    { id: 'l19-e6', x: 0, z: -8 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l19-defend',
                type: 'defend',
                label: 'Secure the data vault (stand in the zone 3 s), then defend it for 45 s',
                defendLabel: 'Defend the data vault for 45 s',
                zone: { id: 'l19-zone', x: 0, z: -12, size: 4 },
                dwellSeconds: 3,
                surviveSeconds: 45
            }
        ],
        checkpointDefinitions: checkpointsFor([
            {
                id: 'l19-defend',
                type: 'defend',
                label: 'Secure the data vault (stand in the zone 3 s), then defend it for 45 s'
            }
        ]),
        musicCue: 'final',
        completionRules: { parSeconds: 300 },
        nextLevelId: 20,
        environmentTint: FACILITY_TINT
    },
    {
        id: 20,
        name: 'Underground Exit',
        stage: 'Special Operations',
        difficulty: 'Very Hard',
        environmentId: 'facility-tunnels',
        environment: 'Facility tunnels',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l20-first',
                objectiveId: 'l20-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l20-e1', x: -14, z: -14 },
                    { id: 'l20-e2', x: 0, z: -16 },
                    { id: 'l20-e3', x: 14, z: -14 },
                    { id: 'l20-e4', x: -8, z: -4 }
                ]
            },
            {
                id: 'l20-second',
                objectiveId: 'l20-second',
                variant: 'scout',
                waveAfter: 'l20-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l20-e5', x: -14, z: 0 },
                    { id: 'l20-e6', x: 14, z: 0 },
                    { id: 'l20-e7', x: 0, z: -8 }
                ]
            },
            {
                id: 'l20-third',
                objectiveId: 'l20-third',
                variant: 'heavy',
                waveAfter: 'l20-second',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l20-e8', x: -12, z: -12 },
                    { id: 'l20-e9', x: 12, z: -12 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l20-first',
                type: 'eliminate',
                label: 'Fight through the first tunnel section (4 enemies)',
                targetGroupId: 'l20-first',
                count: 4
            },
            {
                id: 'l20-second',
                type: 'eliminate',
                label: 'Clear the scout patrol (3 enemies)',
                targetGroupId: 'l20-second',
                count: 3
            },
            {
                id: 'l20-third',
                type: 'eliminate',
                label: 'Break the heavy rearguard (2 enemies)',
                targetGroupId: 'l20-third',
                count: 2
            },
            {
                id: 'l20-exit',
                type: 'reach',
                label: 'Reach the surface',
                zone: { id: 'l20-zone', x: 14, z: 14, size: 4 }
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l20-first', type: 'eliminate', label: 'Fight through the first tunnel section (4 enemies)' },
            { id: 'l20-second', type: 'eliminate', label: 'Clear the scout patrol (3 enemies)' },
            { id: 'l20-third', type: 'eliminate', label: 'Break the heavy rearguard (2 enemies)' },
            { id: 'l20-exit', type: 'reach', label: 'Reach the surface' }
        ]),
        musicCue: 'final',
        completionRules: { parSeconds: 480 },
        nextLevelId: 21,
        environmentTint: TUNNEL_TINT
    },
    {
        id: 21,
        name: 'Dead District',
        stage: 'Special Operations',
        difficulty: 'Very Hard',
        environmentId: 'abandoned-city',
        environment: 'Abandoned city',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l21-first',
                objectiveId: 'l21-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l21-e1', x: -14, z: -14 },
                    { id: 'l21-e2', x: 0, z: -16 },
                    { id: 'l21-e3', x: 14, z: -14 },
                    { id: 'l21-e4', x: -8, z: -4 }
                ]
            },
            {
                id: 'l21-flank',
                objectiveId: 'l21-flank',
                variant: 'scout',
                waveAfter: 'l21-first',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l21-e5', x: -16, z: 0 },
                    { id: 'l21-e6', x: 16, z: 0 },
                    { id: 'l21-e7', x: 0, z: -8 }
                ]
            },
            {
                id: 'l21-heavy',
                objectiveId: 'l21-heavy',
                variant: 'heavy',
                waveAfter: 'l21-flank',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l21-e8', x: -12, z: -12 },
                    { id: 'l21-e9', x: 12, z: -12 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l21-first',
                type: 'eliminate',
                label: 'Clear the district centre (4 enemies)',
                targetGroupId: 'l21-first',
                count: 4
            },
            {
                id: 'l21-flank',
                type: 'eliminate',
                label: 'Repulse the flanking scouts (3 enemies)',
                targetGroupId: 'l21-flank',
                count: 3
            },
            {
                id: 'l21-heavy',
                type: 'eliminate',
                label: 'Break the heavy rearguard (2 enemies)',
                targetGroupId: 'l21-heavy',
                count: 2
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l21-first', type: 'eliminate', label: 'Clear the district centre (4 enemies)' },
            { id: 'l21-flank', type: 'eliminate', label: 'Repulse the flanking scouts (3 enemies)' },
            { id: 'l21-heavy', type: 'eliminate', label: 'Break the heavy rearguard (2 enemies)' }
        ]),
        musicCue: 'combat',
        completionRules: { parSeconds: 420 },
        nextLevelId: 22,
        environmentTint: CITY_TINT
    },
    {
        id: 22,
        name: 'Rooftop Corridor',
        stage: 'Special Operations',
        difficulty: 'Very Hard',
        environmentId: 'urban-rooftops',
        environment: 'Urban rooftops',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l22-patrol',
                objectiveId: '',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l22-e1', x: -14, z: 0 },
                    { id: 'l22-e2', x: 14, z: 0 },
                    { id: 'l22-e3', x: 0, z: -8 }
                ]
            },
            {
                id: 'l22-sniper',
                objectiveId: 'l22-sniper',
                variant: 'scout',
                patrolMode: 'stationary',
                spawns: [
                    { id: 'l22-e4', x: -14, z: -14 },
                    { id: 'l22-e5', x: -10, z: -16 },
                    { id: 'l22-e6', x: -16, z: -10 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l22-advance',
                type: 'reach',
                label: 'Advance across the rooftops to the sniper position',
                zone: { id: 'l22-zone', x: -16, z: -16, size: 4 }
            },
            {
                id: 'l22-sniper',
                type: 'eliminate',
                label: 'Disable the sniper position (3 enemies)',
                targetGroupId: 'l22-sniper',
                count: 3
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l22-advance', type: 'reach', label: 'Advance across the rooftops to the sniper position' },
            { id: 'l22-sniper', type: 'eliminate', label: 'Disable the sniper position (3 enemies)' }
        ]),
        musicCue: 'tense',
        completionRules: { parSeconds: 360 },
        nextLevelId: 23,
        environmentTint: ROOFTOP_TINT
    },
    {
        id: 23,
        name: 'Transit Lockdown',
        stage: 'Final Campaign',
        difficulty: 'Extreme',
        environmentId: 'transit-terminal',
        environment: 'Transit terminal',
        // Spawn inside the terminal zone (size 8, centred at z -12,
        // so z -8 is inside), like Level 13: activation dwells from
        // spawn instead of requiring a walk that resets the timer.
        playerSpawn: { x: 0, z: -8 },
        enemySpawnGroups: [
            {
                id: 'l23-guard',
                objectiveId: '',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l23-e1', x: -14, z: -14 },
                    { id: 'l23-e2', x: 14, z: -14 },
                    { id: 'l23-e3', x: 0, z: -16 }
                ]
            },
            {
                id: 'l23-heavy',
                objectiveId: '',
                variant: 'heavy',
                waveAfter: 'l23-guard',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l23-e4', x: -14, z: 0 },
                    { id: 'l23-e5', x: 14, z: 0 },
                    { id: 'l23-e6', x: 0, z: -8 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l23-defend',
                type: 'defend',
                label: 'Secure the terminal (stand in the zone 3 s), then defend it for 60 s',
                defendLabel: 'Defend the terminal for 60 s',
                zone: { id: 'l23-zone', x: 0, z: -12, size: 8 },
                dwellSeconds: 3,
                surviveSeconds: 60
            }
        ],
        checkpointDefinitions: checkpointsFor([
            {
                id: 'l23-defend',
                type: 'defend',
                label: 'Secure the terminal (stand in the zone 3 s), then defend it for 60 s'
            }
        ]),
        musicCue: 'final',
        completionRules: { parSeconds: 300 },
        nextLevelId: 24,
        environmentTint: TERMINAL_TINT
    },
    {
        id: 24,
        name: 'Armored Patrol',
        stage: 'Final Campaign',
        difficulty: 'Extreme',
        environmentId: 'command-district',
        environment: 'Command district',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l24-heavy',
                objectiveId: 'l24-heavy',
                variant: 'heavy',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l24-e1', x: -12, z: -12 },
                    { id: 'l24-e2', x: 12, z: -12 }
                ]
            },
            {
                id: 'l24-support',
                objectiveId: 'l24-support',
                waveAfter: 'l24-heavy',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l24-e3', x: -14, z: 0 },
                    { id: 'l24-e4', x: 14, z: 0 },
                    { id: 'l24-e5', x: 0, z: -8 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l24-heavy',
                type: 'eliminate',
                label: 'Defeat the heavy armored unit (2 heavies)',
                targetGroupId: 'l24-heavy',
                count: 2
            },
            {
                id: 'l24-support',
                type: 'eliminate',
                label: 'Clear the support troops (3 enemies)',
                targetGroupId: 'l24-support',
                count: 3
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l24-heavy', type: 'eliminate', label: 'Defeat the heavy armored unit (2 heavies)' },
            { id: 'l24-support', type: 'eliminate', label: 'Clear the support troops (3 enemies)' }
        ]),
        musicCue: 'combat',
        completionRules: { parSeconds: 420 },
        nextLevelId: 25,
        environmentTint: COMMAND_TINT
    },
    {
        id: 25,
        name: 'Command District',
        stage: 'Final Campaign',
        difficulty: 'Extreme',
        environmentId: 'urban-command-zone',
        environment: 'Urban command zone',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l25-guard',
                objectiveId: '',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l25-e1', x: -14, z: -14 },
                    { id: 'l25-e2', x: 14, z: -14 },
                    { id: 'l25-e3', x: 0, z: -16 },
                    { id: 'l25-e4', x: -8, z: -4 }
                ]
            },
            {
                id: 'l25-elite',
                objectiveId: '',
                variant: 'heavy',
                waveAfter: 'l25-guard',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l25-e5', x: -14, z: 0 },
                    { id: 'l25-e6', x: 14, z: 0 },
                    { id: 'l25-e7', x: 0, z: -8 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l25-first',
                type: 'activate',
                label: 'Secure command post A (stand in the zone 3 s)',
                zone: { id: 'l25-zone-a', x: -12, z: -10, size: 4 },
                dwellSeconds: 3
            },
            {
                id: 'l25-second',
                type: 'activate',
                label: 'Secure command post B (stand in the zone 3 s)',
                zone: { id: 'l25-zone-b', x: 12, z: -10, size: 4 },
                dwellSeconds: 3
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l25-first', type: 'activate', label: 'Secure command post A (stand in the zone 3 s)' },
            { id: 'l25-second', type: 'activate', label: 'Secure command post B (stand in the zone 3 s)' }
        ]),
        musicCue: 'final',
        completionRules: { parSeconds: 420 },
        nextLevelId: 26,
        environmentTint: COMMAND_TINT
    },
    {
        id: 26,
        name: 'Signal Tower',
        stage: 'Final Campaign',
        difficulty: 'Extreme',
        environmentId: 'signal-tower',
        environment: 'Signal tower',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l26-guard',
                objectiveId: '',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l26-e1', x: -14, z: -14 },
                    { id: 'l26-e2', x: 14, z: -14 },
                    { id: 'l26-e3', x: 0, z: -16 }
                ]
            },
            {
                id: 'l26-wave',
                objectiveId: '',
                variant: 'scout',
                waveAfter: 'l26-guard',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l26-e4', x: -14, z: 0 },
                    { id: 'l26-e5', x: 14, z: 0 }
                ]
            },
            {
                id: 'l26-heavy',
                objectiveId: '',
                variant: 'heavy',
                waveAfter: 'l26-wave',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l26-e6', x: -10, z: -10 },
                    { id: 'l26-e7', x: 10, z: -10 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l26-reach',
                type: 'reach',
                label: 'Reach the signal tower',
                zone: { id: 'l26-zone', x: -14, z: -14, size: 4 }
            },
            {
                id: 'l26-defend',
                type: 'defend',
                label: 'Hold the signal tower (stand in the zone 3 s), then hold it for 90 s',
                defendLabel: 'Hold the signal tower for 90 s',
                zone: { id: 'l26-zone-hold', x: -14, z: -14, size: 4 },
                dwellSeconds: 3,
                surviveSeconds: 90
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l26-reach', type: 'reach', label: 'Reach the signal tower' },
            {
                id: 'l26-defend',
                type: 'defend',
                label: 'Hold the signal tower (stand in the zone 3 s), then hold it for 90 s'
            }
        ]),
        musicCue: 'tense',
        completionRules: { parSeconds: 360 },
        nextLevelId: 27,
        environmentTint: TOWER_TINT
    },
    {
        id: 27,
        name: 'Breach Command',
        stage: 'Final Campaign',
        difficulty: 'Extreme',
        environmentId: 'command-complex',
        environment: 'Command complex',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l27-outer',
                objectiveId: 'l27-outer',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l27-e1', x: -14, z: -14 },
                    { id: 'l27-e2', x: 0, z: -16 },
                    { id: 'l27-e3', x: 14, z: -14 },
                    { id: 'l27-e4', x: -8, z: -4 }
                ]
            },
            {
                id: 'l27-guard',
                objectiveId: 'l27-guard',
                variant: 'heavy',
                waveAfter: 'l27-outer',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l27-e5', x: -12, z: -12 },
                    { id: 'l27-e6', x: 12, z: -12 }
                ]
            },
            {
                id: 'l27-commander',
                objectiveId: 'l27-commander',
                variant: 'commander',
                waveAfter: 'l27-guard',
                patrolMode: 'loop',
                spawns: [{ id: 'l27-e7', x: 0, z: -12 }]
            }
        ],
        objectives: [
            {
                id: 'l27-outer',
                type: 'eliminate',
                label: 'Breach the outer guard (4 enemies)',
                targetGroupId: 'l27-outer',
                count: 4
            },
            {
                id: 'l27-guard',
                type: 'eliminate',
                label: 'Break the commander guard (2 heavies)',
                targetGroupId: 'l27-guard',
                count: 2
            },
            {
                id: 'l27-commander',
                type: 'eliminate',
                label: 'Defeat the commander (1 enemy)',
                targetGroupId: 'l27-commander',
                count: 1
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l27-outer', type: 'eliminate', label: 'Breach the outer guard (4 enemies)' },
            { id: 'l27-guard', type: 'eliminate', label: 'Break the commander guard (2 heavies)' },
            { id: 'l27-commander', type: 'eliminate', label: 'Defeat the commander (1 enemy)' }
        ]),
        musicCue: 'final',
        completionRules: { parSeconds: 480 },
        nextLevelId: 28,
        environmentTint: COMMAND_TINT
    },
    {
        id: 28,
        name: 'Final Approach',
        stage: 'Final Showdown',
        difficulty: 'Elite',
        environmentId: 'final-fortress',
        environment: 'Final fortress',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l28-outer',
                objectiveId: 'l28-outer',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l28-e1', x: -14, z: -14 },
                    { id: 'l28-e2', x: 0, z: -16 },
                    { id: 'l28-e3', x: 14, z: -14 },
                    { id: 'l28-e4', x: -8, z: -4 }
                ]
            },
            {
                id: 'l28-inner',
                objectiveId: 'l28-inner',
                variant: 'heavy',
                waveAfter: 'l28-outer',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l28-e5', x: -12, z: -12 },
                    { id: 'l28-e6', x: 0, z: -14 },
                    { id: 'l28-e7', x: 12, z: -12 }
                ]
            }
        ],
        objectives: [
            {
                id: 'l28-outer',
                type: 'eliminate',
                label: 'Break through the outer defenses (4 enemies)',
                targetGroupId: 'l28-outer',
                count: 4
            },
            {
                id: 'l28-inner',
                type: 'eliminate',
                label: 'Clear the inner defense (3 heavies)',
                targetGroupId: 'l28-inner',
                count: 3
            },
            {
                id: 'l28-gate',
                type: 'reach',
                label: 'Reach the inner gate',
                zone: { id: 'l28-zone', x: 14, z: 14, size: 4 }
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l28-outer', type: 'eliminate', label: 'Break through the outer defenses (4 enemies)' },
            { id: 'l28-inner', type: 'eliminate', label: 'Clear the inner defense (3 heavies)' },
            { id: 'l28-gate', type: 'reach', label: 'Reach the inner gate' }
        ]),
        musicCue: 'final',
        completionRules: { parSeconds: 480 },
        nextLevelId: 29,
        environmentTint: FORTRESS_TINT
    },
    {
        id: 29,
        name: 'Final Siege',
        stage: 'Final Showdown',
        difficulty: 'Elite',
        environmentId: 'final-fortress',
        environment: 'Final fortress',
        playerSpawn: { x: 0, z: -8 },
        enemySpawnGroups: [
            {
                id: 'l29-guard',
                objectiveId: 'l29-guard',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l29-e1', x: -14, z: -14 },
                    { id: 'l29-e2', x: 14, z: -14 },
                    { id: 'l29-e3', x: 0, z: -16 },
                    { id: 'l29-e4', x: -8, z: -4 }
                ]
            },
            {
                id: 'l29-heavy',
                objectiveId: '',
                variant: 'heavy',
                waveAfter: 'l29-guard',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l29-e5', x: -14, z: 0 },
                    { id: 'l29-e6', x: 14, z: 0 },
                    { id: 'l29-e7', x: 0, z: -8 }
                ]
            },
            {
                id: 'l29-commander',
                objectiveId: 'l29-commander',
                variant: 'commander',
                waveAfter: 'l29-heavy',
                patrolMode: 'loop',
                spawns: [{ id: 'l29-e8', x: 0, z: -12 }]
            }
        ],
        objectives: [
            {
                id: 'l29-guard',
                type: 'eliminate',
                label: 'Survive the first siege wave (4 enemies)',
                targetGroupId: 'l29-guard',
                count: 4
            },
            {
                id: 'l29-commander',
                type: 'eliminate',
                label: 'Defeat the heavy commander (1 enemy)',
                targetGroupId: 'l29-commander',
                count: 1
            },
            {
                id: 'l29-hold',
                type: 'defend',
                label: 'Hold the fortress (stand in the zone 3 s), then hold it for 90 s',
                defendLabel: 'Hold the fortress for 90 s',
                zone: { id: 'l29-zone', x: 0, z: -12, size: 8 },
                dwellSeconds: 3,
                surviveSeconds: 90
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l29-guard', type: 'eliminate', label: 'Survive the first siege wave (4 enemies)' },
            { id: 'l29-commander', type: 'eliminate', label: 'Defeat the heavy commander (1 enemy)' },
            {
                id: 'l29-hold',
                type: 'defend',
                label: 'Hold the fortress (stand in the zone 3 s), then hold it for 90 s'
            }
        ]),
        musicCue: 'final',
        completionRules: { parSeconds: 540 },
        nextLevelId: 30,
        environmentTint: FORTRESS_TINT
    },
    {
        id: 30,
        name: 'Last Signal',
        stage: 'Final Showdown',
        difficulty: 'Elite',
        environmentId: 'final-control-room',
        environment: 'Final control room',
        playerSpawn: { x: 0, z: 12 },
        enemySpawnGroups: [
            {
                id: 'l30-outer',
                objectiveId: 'l30-outer',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l30-e1', x: -14, z: -14 },
                    { id: 'l30-e2', x: 0, z: -16 },
                    { id: 'l30-e3', x: 14, z: -14 },
                    { id: 'l30-e4', x: -8, z: -4 }
                ]
            },
            {
                id: 'l30-support',
                objectiveId: '',
                variant: 'heavy',
                waveAfter: 'l30-outer',
                patrolMode: 'loop',
                spawns: [
                    { id: 'l30-e5', x: -12, z: -12 },
                    { id: 'l30-e6', x: 12, z: -12 }
                ]
            },
            {
                id: 'l30-commander',
                objectiveId: 'l30-commander',
                variant: 'commander',
                waveAfter: 'l30-support',
                patrolMode: 'loop',
                spawns: [{ id: 'l30-e7', x: 0, z: -12 }]
            }
        ],
        objectives: [
            {
                id: 'l30-outer',
                type: 'eliminate',
                label: 'Clear the final guard (4 enemies)',
                targetGroupId: 'l30-outer',
                count: 4
            },
            {
                id: 'l30-commander',
                type: 'eliminate',
                label: 'Defeat the final commander (1 enemy)',
                targetGroupId: 'l30-commander',
                count: 1
            },
            {
                id: 'l30-console',
                type: 'activate',
                label: 'Activate the final console (stand in the zone 3 s)',
                zone: { id: 'l30-zone-console', x: 0, z: -12, size: 4 },
                dwellSeconds: 3
            },
            {
                id: 'l30-escape',
                type: 'reach',
                label: 'Escape after the last encounter',
                zone: { id: 'l30-zone-escape', x: 14, z: 14, size: 4 }
            }
        ],
        checkpointDefinitions: checkpointsFor([
            { id: 'l30-outer', type: 'eliminate', label: 'Clear the final guard (4 enemies)' },
            { id: 'l30-commander', type: 'eliminate', label: 'Defeat the final commander (1 enemy)' },
            { id: 'l30-console', type: 'activate', label: 'Activate the final console (stand in the zone 3 s)' },
            { id: 'l30-escape', type: 'reach', label: 'Escape after the last encounter' }
        ]),
        musicCue: 'final',
        completionRules: { parSeconds: 600 },
        nextLevelId: null,
        environmentTint: CONTROL_TINT
    }
];

/** Build 7: every catalog entry is now a playable level record — no locked summaries remain. */
export const CATALOG: readonly CatalogEntry[] = LEVELS.map((level): CatalogEntry => ({
    id: level.id,
    name: level.name,
    stage: level.stage,
    environment: level.environment,
    objectiveSummary: level.objectives.map((objective) => objective.label).join(' · '),
    playable: true,
    difficulty: level.difficulty
}));

export function findLevel(id: number): LevelRecord | null {
    return LEVELS.find((level) => level.id === id) ?? null;
}

/**
 * Validates a level record on load (SRS section 12.1). Throws an Error
 * naming the first missing or out-of-range field, instead of letting a
 * half-defined level start and fail mid-mission.
 */
export function validateLevel(level: LevelRecord): void {
    const missing = (field: string): Error => new Error(`Level ${level.id} is missing required field: ${field}`);
    if (level.name === '') throw missing('name');
    if (level.stage === undefined) throw missing('stage');
    if (level.difficulty === undefined) throw missing('difficulty');
    if (level.environmentId === '') throw missing('environmentId');
    if (level.environment === '') throw missing('environment');
    if (level.playerSpawn === undefined) throw missing('playerSpawn');
    if (Math.abs(level.playerSpawn.x) > 19 || Math.abs(level.playerSpawn.z) > 19) {
        throw new Error(`Level ${level.id}: playerSpawn is outside the arena`);
    }
    if (level.enemySpawnGroups.length === 0) throw missing('enemySpawnGroups');
    if (
        level.perceptionMultiplier !== undefined &&
        (level.perceptionMultiplier <= 0 || level.perceptionMultiplier > 1)
    ) {
        throw new Error(`Level ${level.id}: perceptionMultiplier must be in (0, 1]`);
    }
    for (const group of level.enemySpawnGroups) {
        if (
            group.variant !== undefined &&
            group.variant !== 'grunt' &&
            group.variant !== 'heavy' &&
            group.variant !== 'scout' &&
            group.variant !== 'commander'
        ) {
            throw new Error(`Level ${level.id}: group ${group.id} has unknown variant ${group.variant}`);
        }
        if (group.spawns.length === 0) throw new Error(`Level ${level.id}: group ${group.id} has no spawns`);
        for (const spawn of group.spawns) {
            if (Math.abs(spawn.x) > 19 || Math.abs(spawn.z) > 19) {
                throw new Error(`Level ${level.id}: spawn ${spawn.id} is outside the arena`);
            }
        }
    }
    if (level.objectives.length === 0) throw missing('objectives');
    for (const objective of level.objectives) {
        if (objective.label === '') throw missing(`objectives.${objective.id}.label`);
        if (objective.zone !== undefined) {
            if (Math.abs(objective.zone.x) > 19 || Math.abs(objective.zone.z) > 19) {
                throw new Error(`Level ${level.id}: zone ${objective.zone.id} is outside the arena`);
            }
        }
    }
    if (level.checkpointDefinitions.length === 0) throw missing('checkpointDefinitions');
    if (level.musicCue === '') throw missing('musicCue');
    if (level.completionRules === undefined) throw missing('completionRules');
    if (level.environmentTint === undefined) throw missing('environmentTint');
}

export function validateCatalog(): void {
    for (const level of LEVELS) {
        validateLevel(level);
    }
    if (CATALOG.length !== 30) {
        throw new Error(`Campaign catalog must contain exactly 30 levels, found ${CATALOG.length}`);
    }
}
