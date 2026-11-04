/**
 * Build 5 — wave triggers (SRS section 7-D, FR-17).
 * Pure: groups spawn initially or when their waveAfter group has been
 * fully cleared. A group triggers its wave exactly once, because the
 * triggered group is marked spawned at trigger time and never
 * re-checked. On a checkpoint retry, respawned groups are marked
 * spawned again (they are about to be instantiated) and their dead
 * members are forgotten, so their own waves can trigger again.
 */
import type { EnemyGroupDefinition } from '../../data/levels';

export class WaveSpawner {
    private readonly groups: readonly EnemyGroupDefinition[];
    private readonly membersByGroup = new Map<string, readonly string[]>();
    private readonly spawned = new Set<string>();
    private readonly dead = new Set<string>();

    constructor(groups: readonly EnemyGroupDefinition[]) {
        this.groups = groups;
        for (const group of groups) {
            this.membersByGroup.set(
                group.id,
                group.spawns.map((spawn) => spawn.id)
            );
            if (group.waveAfter === undefined) {
                this.spawned.add(group.id);
            }
        }
    }

    initialGroupIds(): readonly string[] {
        return this.groups.filter((group) => group.waveAfter === undefined).map((group) => group.id);
    }

    isSpawned(groupId: string): boolean {
        return this.spawned.has(groupId);
    }

    /**
     * Records a death. Returns the id of a wave group to spawn now, or
     * null when no wave triggers. Enemy ids not in any group are ignored.
     */
    markDead(enemyId: string): string | null {
        this.dead.add(enemyId);
        for (const group of this.groups) {
            const members = this.membersByGroup.get(group.id) ?? [];
            if (!members.includes(enemyId)) {
                continue;
            }
            const cleared = members.every((member) => this.dead.has(member));
            if (!cleared) {
                return null;
            }
            const wave = this.groups.find((candidate) => candidate.waveAfter === group.id);
            if (wave === undefined || this.spawned.has(wave.id)) {
                return null;
            }
            this.spawned.add(wave.id);
            return wave.id;
        }
        return null;
    }

    /**
     * Build 6 — trigger the next unspawned wave group directly, without
     * waiting for a clear. Defend missions use this when the hold
     * phase starts, so pressure escalates even if the player ignores
     * the guards instead of clearing them. Returns the group id, or
     * null when no wave group is left unspawned.
     */
    triggerNextWave(): string | null {
        for (const group of this.groups) {
            if (group.waveAfter !== undefined && !this.spawned.has(group.id)) {
                this.spawned.add(group.id);
                return group.id;
            }
        }
        return null;
    }

    /** Group id for an enemy id, or null when the enemy belongs to no group. */
    groupOf(enemyId: string): string | null {
        for (const [groupId, members] of this.membersByGroup) {
            if (members.includes(enemyId)) {
                return groupId;
            }
        }
        return null;
    }

    /** Checkpoint retry: respawned groups are live again, their waves re-armable. */
    resetForGroups(groupIds: readonly string[]): void {
        for (const groupId of groupIds) {
            this.spawned.add(groupId);
            for (const member of this.membersByGroup.get(groupId) ?? []) {
                this.dead.delete(member);
            }
        }
    }
}
