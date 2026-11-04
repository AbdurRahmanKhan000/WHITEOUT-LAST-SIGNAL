/**
 * Build 5 — Mission system (SRS section 7-D, FR-15/16/17/18/19/20/21/24).
 * Owns campaign flow only: level selection, objective tracking, waves,
 * checkpoints, results and saves. It never builds scene geometry (that
 * is PlayerSystem's mission arena, fed by the mission.started payload)
 * and never damages enemies (that is EnemySystem, fed by the same
 * payload's spawn groups). All cross-system wiring is the typed
 * EventBus; the only service reads are the player snapshot (the same
 * interface EnemySystem already uses) and the save repository.
 *
 * Unlock check uses the save snapshot loaded at boot, so the whole
 * Deploy → mission.started → pointer-lock chain stays synchronous
 * inside the Deploy click gesture. The snapshot is refreshed after
 * every recorded result.
 */
import type { GameStateMachine } from '../../app/GameStateMachine';
import type { EventBus } from '../../core/EventBus';
import type { GameContext, GameSystem, MissionResult, SaveData } from '../../core/GameTypes';
import { findLevel, validateLevel } from '../../data/levels';
import type { LevelRecord } from '../../data/levels';
import type { SaveRepository } from '../../services/SaveRepository';
import type { PlayerSnapshotProvider } from '../enemy/EnemySystem';

import { CheckpointManager } from './CheckpointManager';
import { ObjectiveManager } from './ObjectiveManager';
import { calculateScore, nextUnlockedLevel } from './score';
import { WaveSpawner } from './WaveSpawner';

export class MissionSystem implements GameSystem {
    readonly name = 'mission';

    private eventBus: EventBus | null = null;
    private stateMachine: GameStateMachine | null = null;
    private save: SaveRepository | null = null;
    private playerProvider: PlayerSnapshotProvider | null = null;
    private readonly cleanups: (() => void)[] = [];
    private cachedSave: SaveData | null = null;

    private activeLevel: LevelRecord | null = null;
    private objectives: ObjectiveManager | null = null;
    private waves: WaveSpawner | null = null;
    private checkpoints: CheckpointManager | null = null;
    private shots = 0;
    private hits = 0;
    private kills = 0;
    private damageReceived = 0;
    private startedAt = 0;

    initialize(context: GameContext): void {
        this.eventBus = context.eventBus;
        this.stateMachine = context.services.get<GameStateMachine>('stateMachine');
        try {
            this.save = context.services.get<SaveRepository>('save');
        } catch {
            this.save = null;
        }
        try {
            this.playerProvider = context.services.get<PlayerSnapshotProvider>('playerSystem');
        } catch {
            this.playerProvider = null;
        }
        if (this.save !== null) {
            void this.save.load().then((data) => {
                this.cachedSave = data;
            });
        }
        this.cleanups.push(
            context.eventBus.on('mission.requested', ({ levelId }) => this.startMission(levelId)),
            context.eventBus.on('mission.retryCheckpointRequested', () => this.retryCheckpoint()),
            context.eventBus.on('mission.exitRequested', () => {
                this.activeLevel = null;
                this.objectives = null;
                this.waves = null;
                this.checkpoints = null;
            }),
            context.eventBus.on('app.stateChanged', ({ newState }) => {
                if (newState === 'mainMenu') {
                    this.activeLevel = null;
                    this.objectives = null;
                    this.waves = null;
                    this.checkpoints = null;
                }
                if (newState === 'defeat' && this.activeLevel !== null) {
                    this.eventBus?.emit('mission.defeated', { levelId: this.activeLevel.id });
                }
            }),
            context.eventBus.on('weapon.fired', ({ ownerId }) => {
                if (this.activeLevel !== null && ownerId === 'player') {
                    this.shots += 1;
                }
            }),
            context.eventBus.on('combat.hitConfirmed', ({ sourceId }) => {
                if (this.activeLevel !== null && sourceId === 'player') {
                    this.hits += 1;
                }
            }),
            context.eventBus.on('player.healthChanged', ({ delta }) => {
                if (this.activeLevel !== null && delta < 0) {
                    this.damageReceived += -delta;
                }
            }),
            context.eventBus.on('entity.died', ({ entityType, entityId }) => {
                if (this.activeLevel === null || entityType !== 'enemy') {
                    return;
                }
                this.kills += 1;
                const groupId = this.waves?.groupOf(entityId) ?? null;
                this.objectives?.onKill(groupId ?? 'all');
                const triggered = this.waves?.markDead(entityId) ?? null;
                if (triggered !== null) {
                    this.eventBus?.emit('mission.waveTriggered', { groupId: triggered });
                }
            })
        );
    }

    update(dt: number): void {
        if (this.activeLevel === null || this.objectives === null || this.stateMachine?.current !== 'playing') {
            return;
        }
        const snapshot = this.playerProvider?.getPlayerSnapshot() ?? null;
        if (snapshot === null) {
            return;
        }
        const before = this.objectives.completedIds();
        // Build 6: a defend objective's hold phase is a real phase
        // change, not just a timer. When activation flips, the HUD
        // must show the hold label (not the activation label) and the
        // next wave must spawn, so defend missions escalate even if
        // the player ignored the guards instead of clearing them.
        const currentBefore = this.objectives.current();
        const wasActivated = currentBefore?.activated ?? false;
        this.objectives.onZone(snapshot.x, snapshot.z, dt);
        const currentAfterZone = this.objectives.current();
        if (
            currentAfterZone !== null &&
            currentAfterZone.definition.type === 'defend' &&
            !wasActivated &&
            currentAfterZone.activated
        ) {
            const triggered = this.waves?.triggerNextWave() ?? null;
            if (triggered !== null) {
                this.eventBus?.emit('mission.waveTriggered', { groupId: triggered });
            }
            this.eventBus?.emit('mission.objectiveChanged', {
                label: currentAfterZone.definition.defendLabel ?? currentAfterZone.definition.label
            });
        }
        this.objectives.onTick(dt);
        const after = this.objectives.completedIds();
        if (after.length !== before.length) {
            const completed = after.filter((id) => !before.includes(id));
            for (const id of completed) {
                const progress = this.objectives.progressOf(id);
                if (progress !== null) {
                    this.eventBus?.emit('objective.progressChanged', {
                        objectiveId: id,
                        current: progress.current,
                        target: progress.target,
                        status: 'complete'
                    });
                }
                if (this.checkpoints !== null) {
                    this.checkpoints.record(`cp-${id}`, { x: snapshot.x, z: snapshot.z }, after, this.kills);
                }
            }
            const current = this.objectives.current();
            this.eventBus?.emit('mission.objectiveChanged', {
                label: current !== null ? current.definition.label : 'All objectives complete'
            });
        }
        if (this.objectives.anyFailed()) {
            this.failMission();
            return;
        }
        if (this.objectives.allComplete()) {
            this.completeMission();
        }
    }

    dispose(): void {
        for (const cleanup of this.cleanups.splice(0)) {
            cleanup();
        }
        this.eventBus = null;
        this.stateMachine = null;
        this.save = null;
        this.playerProvider = null;
        this.activeLevel = null;
        this.objectives = null;
        this.waves = null;
        this.checkpoints = null;
    }

    private startMission(levelId: number): void {
        const level = findLevel(levelId);
        if (level === null) {
            this.eventBus?.emit('app.error', {
                message: `Level ${levelId} does not exist yet.`,
                recoverable: true
            });
            return;
        }
        const unlocked = this.cachedSave?.unlockedLevel ?? 1;
        if (levelId > unlocked) {
            this.eventBus?.emit('app.error', {
                message: `Level ${levelId} is locked. Complete level ${unlocked} first.`,
                recoverable: true
            });
            return;
        }
        try {
            validateLevel(level);
        } catch (error) {
            this.eventBus?.emit('app.error', {
                message: error instanceof Error ? error.message : 'Invalid level data.',
                recoverable: true
            });
            return;
        }
        this.activeLevel = level;
        this.objectives = new ObjectiveManager(level.objectives);
        this.waves = new WaveSpawner(level.enemySpawnGroups);
        this.checkpoints = new CheckpointManager(level.playerSpawn);
        this.shots = 0;
        this.hits = 0;
        this.kills = 0;
        this.damageReceived = 0;
        this.startedAt = performance.now() / 1000;
        const zones = level.objectives
            .filter((objective) => objective.zone !== undefined)
            .map((objective) => objective.zone!);
        const first = this.objectives.current();
        this.eventBus?.emit('mission.started', {
            levelId: level.id,
            name: level.name,
            playerSpawn: level.playerSpawn,
            rifleReserve: level.rifleReserve ?? 120,
            perceptionMultiplier: level.perceptionMultiplier ?? 1,
            groups: level.enemySpawnGroups,
            zones,
            environmentTint: level.environmentTint,
            objectiveLabel: first !== null ? first.definition.label : 'All objectives complete'
        });
    }

    private retryCheckpoint(): void {
        if (this.activeLevel === null || this.checkpoints === null || this.objectives === null || this.waves === null) {
            return;
        }
        const checkpoint = this.checkpoints.current();
        this.objectives.restore(checkpoint.completedObjectiveIds);
        this.kills = checkpoint.kills;
        const respawnGroupIds = this.checkpoints.respawnGroupIds(this.activeLevel);
        this.waves.resetForGroups(respawnGroupIds);
        this.eventBus?.emit('mission.retryCheckpoint', {
            position: [checkpoint.position.x, 0, checkpoint.position.z],
            respawnGroupIds
        });
        const current = this.objectives.current();
        this.eventBus?.emit('mission.objectiveChanged', {
            label: current !== null ? current.definition.label : 'All objectives complete'
        });
    }

    private failMission(): void {
        if (this.activeLevel === null) {
            return;
        }
        this.stateMachine?.transitionTo('defeat');
    }

    private completeMission(): void {
        if (this.activeLevel === null) {
            return;
        }
        const level = this.activeLevel;
        const timeSeconds = Math.round(performance.now() / 1000 - this.startedAt);
        const accuracy = this.shots > 0 ? Math.min(100, (this.hits / this.shots) * 100) : 0;
        const { score, rank } = calculateScore({
            kills: this.kills,
            accuracy,
            timeSeconds,
            damageReceived: this.damageReceived,
            parSeconds: level.completionRules.parSeconds
        });
        const result: MissionResult = {
            missionId: String(level.id),
            kills: this.kills,
            accuracy: Math.round(accuracy),
            timeSeconds,
            damageReceived: this.damageReceived,
            score
        };
        void this.recordResult(level, result);
        this.eventBus?.emit('mission.completed', {
            levelId: level.id,
            kills: this.kills,
            accuracy: Math.round(accuracy),
            timeSeconds,
            damageReceived: this.damageReceived,
            score,
            rank,
            nextLevelId: level.nextLevelId
        });
        this.stateMachine?.transitionTo('victory');
    }

    private async recordResult(level: LevelRecord, result: MissionResult): Promise<void> {
        if (this.save === null) {
            return;
        }
        const current = await this.save.load();
        const bestResults = { ...current.bestResults };
        const existing = bestResults[result.missionId];
        if (existing === undefined || result.score > existing.score) {
            bestResults[result.missionId] = result;
        }
        const next: SaveData = {
            ...current,
            unlockedLevel: nextUnlockedLevel(current.unlockedLevel, level.id, true),
            bestResults
        };
        await this.save.save(next);
        this.cachedSave = next;
    }
}
