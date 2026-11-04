/**
 * Build 5 — checkpoints (SRS section 7-D, FR-18).
 * Pure. The checkpoint rule, exactly as implemented:
 * - Level start is always a checkpoint; each completed objective creates
 *   a new checkpoint at the player's current position.
 * - On defeat, "Retry from checkpoint" restores that position with full
 *   health and full ammo, keeps completed objectives, and restores the
 *   kill count to the checkpoint value.
 * - Groups belonging to incomplete objectives respawn at full strength.
 *   Groups tied to a completed eliminate objective never respawn. Kills
 *   on a respawned group after the retry count as new encounters — the
 *   checkpoint kill count is the value at checkpoint time, not a
 *   per-enemy ledger. No full enemy-state snapshot is kept, by design.
 */
import type { LevelRecord } from '../../data/levels';

export interface Checkpoint {
    readonly id: string;
    readonly position: { readonly x: number; readonly z: number };
    readonly completedObjectiveIds: readonly string[];
    readonly kills: number;
}

export class CheckpointManager {
    private checkpoint: Checkpoint;

    constructor(startPosition: { readonly x: number; readonly z: number }) {
        this.checkpoint = { id: 'cp-start', position: startPosition, completedObjectiveIds: [], kills: 0 };
    }

    record(
        id: string,
        position: { readonly x: number; readonly z: number },
        completedObjectiveIds: readonly string[],
        kills: number
    ): void {
        this.checkpoint = { id, position, completedObjectiveIds: [...completedObjectiveIds], kills };
    }

    current(): Checkpoint {
        return this.checkpoint;
    }

    /** Groups to respawn on retry: every group except those tied to a completed eliminate objective. */
    respawnGroupIds(level: LevelRecord): readonly string[] {
        const completedEliminateTargets = new Set<string>();
        for (const objective of level.objectives) {
            if (
                objective.type === 'eliminate' &&
                objective.targetGroupId !== undefined &&
                this.checkpoint.completedObjectiveIds.includes(objective.id)
            ) {
                completedEliminateTargets.add(objective.targetGroupId);
            }
        }
        return level.enemySpawnGroups
            .filter((group) => !completedEliminateTargets.has(group.id))
            .map((group) => group.id);
    }
}
