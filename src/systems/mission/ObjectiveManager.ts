/**
 * Build 5 — objective tracking (SRS section 7-D, FR-15/16).
 * Pure logic, no engine or DOM: objectives run in order, only the first
 * incomplete objective is active, and every change is reported once by
 * the caller comparing completed ids. Rules, documented here because
 * they are gameplay promises:
 * - eliminate: counts kills for its group ('all' counts any enemy kill).
 * - activate: continuous dwell in the zone; leaving before the dwell
 *   time resets the dwell counter.
 * - reach: entering the zone completes it.
 * - survive: a timer that runs from when the objective becomes active.
 * - defend: two phases in one objective — dwell to activate, then a
 *   survive timer that runs regardless of position (a simplified hold;
 *   proximity is not re-checked during the hold phase).
 * - timeLimitSeconds: if the objective is still incomplete when the
 *   limit expires, it fails, and the mission fails with it.
 */
import type { ObjectiveDefinition } from '../../data/levels';

export type ObjectiveStatus = 'pending' | 'inProgress' | 'complete' | 'failed';

export interface ManagedObjective {
    readonly definition: ObjectiveDefinition;
    status: ObjectiveStatus;
    /** Kills (eliminate) or seconds accumulated (timers/dwell). */
    progress: number;
    /** Defend only: true once the dwell phase has finished. */
    activated: boolean;
}

export class ObjectiveManager {
    private readonly objectives: ManagedObjective[];
    private elapsed = 0;

    constructor(definitions: readonly ObjectiveDefinition[]) {
        this.objectives = definitions.map((definition) => ({
            definition,
            status: 'pending',
            progress: 0,
            activated: false
        }));
    }

    /** The first incomplete objective, or null when all are complete. */
    current(): ManagedObjective | null {
        return (
            this.objectives.find((objective) => objective.status !== 'complete' && objective.status !== 'failed') ??
            null
        );
    }

    allComplete(): boolean {
        return this.objectives.length > 0 && this.objectives.every((objective) => objective.status === 'complete');
    }

    anyFailed(): boolean {
        return this.objectives.some((objective) => objective.status === 'failed');
    }

    completedIds(): readonly string[] {
        return this.objectives
            .filter((objective) => objective.status === 'complete')
            .map((objective) => objective.definition.id);
    }

    /** Restore a checkpoint: completed objectives stay complete, the current one restarts from zero. */
    restore(completedIds: readonly string[]): void {
        for (const objective of this.objectives) {
            if (completedIds.includes(objective.definition.id)) {
                objective.status = 'complete';
            } else {
                objective.status = 'pending';
                objective.progress = 0;
                objective.activated = false;
            }
        }
        this.elapsed = 0;
    }

    onKill(groupId: string | null): void {
        const current = this.current();
        if (current === null || current.definition.type !== 'eliminate') {
            return;
        }
        const target = current.definition.targetGroupId;
        if (target !== undefined && target !== 'all' && target !== groupId) {
            return;
        }
        current.status = 'inProgress';
        current.progress += 1;
        const needed = current.definition.count ?? Number.POSITIVE_INFINITY;
        if (current.progress >= needed) {
            current.status = 'complete';
        }
    }

    /** Zone/dwell handling for the current objective; call every frame while playing. */
    onZone(playerX: number, playerZ: number, dt: number): void {
        const current = this.current();
        if (current === null) {
            return;
        }
        const zone = current.definition.zone;
        if (zone === undefined) {
            return;
        }
        const inside = Math.abs(playerX - zone.x) <= zone.size / 2 && Math.abs(playerZ - zone.z) <= zone.size / 2;
        if (current.definition.type === 'reach') {
            if (inside) {
                current.status = 'complete';
            }
            return;
        }
        if (current.definition.type === 'activate' || current.definition.type === 'defend') {
            if (current.definition.type === 'defend' && current.activated) {
                return;
            }
            if (!inside) {
                current.progress = 0;
                return;
            }
            current.status = 'inProgress';
            current.progress += dt;
            const dwell = current.definition.dwellSeconds ?? 3;
            if (current.progress >= dwell) {
                if (current.definition.type === 'activate') {
                    current.status = 'complete';
                } else {
                    current.activated = true;
                    current.progress = 0;
                }
            }
        }
    }

    /** Timers for survive/defend holds and for time limits; call every frame while playing. */
    onTick(dt: number): void {
        this.elapsed += dt;
        const current = this.current();
        if (current === null) {
            return;
        }
        const limit = current.definition.timeLimitSeconds;
        if (limit !== undefined && this.elapsed > limit) {
            current.status = 'failed';
            return;
        }
        if (current.definition.type === 'survive') {
            current.status = 'inProgress';
            current.progress += dt;
            if (current.progress >= (current.definition.surviveSeconds ?? 0)) {
                current.status = 'complete';
            }
            return;
        }
        if (current.definition.type === 'defend' && current.activated) {
            current.status = 'inProgress';
            current.progress += dt;
            if (current.progress >= (current.definition.surviveSeconds ?? 0)) {
                current.status = 'complete';
            }
        }
    }

    /** Progress snapshot for the HUD/event payloads. */
    progressOf(
        objectiveId: string
    ): { readonly current: number; readonly target: number; readonly status: ObjectiveStatus } | null {
        const objective = this.objectives.find((candidate) => candidate.definition.id === objectiveId);
        if (objective === undefined) {
            return null;
        }
        const definition = objective.definition;
        const target =
            definition.type === 'eliminate'
                ? (definition.count ?? 0)
                : definition.type === 'survive'
                  ? (definition.surviveSeconds ?? 0)
                  : definition.type === 'defend'
                    ? objective.activated
                        ? (definition.surviveSeconds ?? 0)
                        : (definition.dwellSeconds ?? 0)
                    : (definition.dwellSeconds ?? 0);
        return { current: Math.floor(objective.progress), target, status: objective.status };
    }
}
