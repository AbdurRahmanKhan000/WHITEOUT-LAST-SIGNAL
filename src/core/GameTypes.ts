import type { EventBus } from './EventBus';
import type { Logger } from './Logger';
import type { ServiceContainer } from './ServiceContainer';

/**
 * Shared domain types and the typed event contract (SRS sections 4-5, 12).
 *
 * Event payloads are immutable snapshots: systems never pass mutable
 * PlayCanvas entities, DOM nodes, or full engine objects through the bus.
 * A payload that needs a position uses a plain [x, y, z] tuple.
 */

export type Vec3Tuple = readonly [number, number, number];

export type GameState =
    'boot' | 'mainMenu' | 'loading' | 'briefing' | 'playing' | 'paused' | 'victory' | 'defeat' | 'error';

export type QualityPreset = 'low' | 'medium' | 'high';

export interface AudioSettings {
    readonly master: number;
    readonly music: number;
    readonly sfx: number;
    readonly muted: boolean;
}

export interface Settings {
    readonly audio: AudioSettings;
    readonly sensitivity: number;
    readonly quality: QualityPreset;
}

export interface MissionResult {
    readonly missionId: string;
    readonly kills: number;
    readonly accuracy: number;
    readonly timeSeconds: number;
    readonly damageReceived: number;
    readonly score: number;
}

export interface SaveData {
    readonly schemaVersion: 1;
    readonly unlockedLevel: number;
    readonly bestResults: Readonly<Record<string, MissionResult>>;
    readonly settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
    audio: { master: 0.8, music: 0.6, sfx: 0.8, muted: false },
    sensitivity: 1,
    quality: 'medium'
};

export const DEFAULT_SAVE: SaveData = {
    schemaVersion: 1,
    unlockedLevel: 1,
    bestResults: {},
    settings: DEFAULT_SETTINGS
};

export interface GameEventMap {
    'weapon.fired': {
        readonly ownerId: string;
        readonly weaponId: string;
        readonly origin: Vec3Tuple;
        readonly direction: Vec3Tuple;
        readonly shotId: string;
    };
    'combat.hitConfirmed': {
        readonly sourceId: string;
        readonly targetId: string;
        readonly hitZone: string;
        readonly damage: number;
        readonly worldPosition: Vec3Tuple;
    };
    'entity.died': {
        readonly entityId: string;
        readonly entityType: 'player' | 'enemy';
        readonly killerId: string;
        readonly position: Vec3Tuple;
    };
    'player.healthChanged': {
        readonly current: number;
        readonly maximum: number;
        readonly delta: number;
    };
    'player.ammoChanged': {
        readonly weaponId: string;
        readonly magazine: number;
        readonly reserve: number;
    };
    'objective.progressChanged': {
        readonly objectiveId: string;
        readonly current: number;
        readonly target: number;
        readonly status: 'pending' | 'inProgress' | 'complete' | 'failed';
    };
    'mission.stateChanged': {
        readonly missionId: string;
        readonly previousState: GameState;
        readonly newState: GameState;
    };
    'checkpoint.activated': {
        readonly checkpointId: string;
        readonly spawnTransform: Vec3Tuple;
    };
    'weapon.reloadStarted': {
        readonly weaponId: string;
    };
    'weapon.reloadCompleted': {
        readonly weaponId: string;
        readonly magazine: number;
        readonly reserve: number;
    };
    'arena.restarted': {
        readonly source: string;
    };
    'settings.audioChanged': AudioSettings;
    'app.stateChanged': {
        readonly previousState: GameState;
        readonly newState: GameState;
    };
    'app.error': {
        readonly message: string;
        readonly recoverable: boolean;
    };
}

export type GameEventName = keyof GameEventMap;

export interface GameContext {
    readonly eventBus: EventBus;
    readonly services: ServiceContainer;
    readonly logger: Logger;
}

export interface GameSystem {
    readonly name: string;
    initialize(context: GameContext): Promise<void> | void;
    update?(dt: number): void;
    fixedUpdate?(fixedDt: number): void;
    dispose(): void;
}
