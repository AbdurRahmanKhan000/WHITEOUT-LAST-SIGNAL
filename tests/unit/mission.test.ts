import { describe, expect, it } from 'vitest';

import { CATALOG, findLevel, validateCatalog, validateLevel } from '../../src/data/levels';
import { normalizeSave } from '../../src/services/SaveRepository';
import { CheckpointManager } from '../../src/systems/mission/CheckpointManager';
import { ObjectiveManager } from '../../src/systems/mission/ObjectiveManager';
import { calculateScore, nextUnlockedLevel } from '../../src/systems/mission/score';
import { WaveSpawner } from '../../src/systems/mission/WaveSpawner';

describe('level catalog', () => {
    it('contains exactly 30 levels with unique ids and names', () => {
        expect(CATALOG.length).toBe(30);
        expect(new Set(CATALOG.map((entry) => entry.id)).size).toBe(30);
        expect(new Set(CATALOG.map((entry) => entry.name)).size).toBe(30);
    });

    it('validates all playable levels and their required fields', () => {
        expect(() => validateCatalog()).not.toThrow();
        const level = findLevel(1);
        expect(level).not.toBeNull();
        expect(level?.name).toBe('First Contact');
        // Build 6: Level 11 is playable now; the unbuilt frontier is 21.
        expect(findLevel(11)?.name).toBe('Frozen Entry');
        expect(findLevel(21)).toBeNull();
    });

    it('fails clearly on a level with a missing objective label', () => {
        const level = findLevel(1);
        expect(level).not.toBeNull();
        if (level === null) {
            return;
        }
        const broken = {
            ...level,
            objectives: [{ ...level.objectives[0], label: '' }]
        };
        expect(() => validateLevel(broken)).toThrow('label');
    });
});

describe('objective manager', () => {
    it('completes an eliminate objective at the kill count, ignoring other groups', () => {
        const manager = new ObjectiveManager([
            { id: 'a', type: 'eliminate', label: 'Clear group A', targetGroupId: 'g-a', count: 2 },
            { id: 'b', type: 'eliminate', label: 'Clear group B', targetGroupId: 'g-b', count: 1 }
        ]);
        manager.onKill('g-b');
        expect(manager.completedIds()).toEqual([]);
        manager.onKill('g-a');
        manager.onKill('g-a');
        expect(manager.completedIds()).toEqual(['a']);
        expect(manager.current()?.definition.id).toBe('b');
    });

    it('requires continuous dwell for activate and resets when leaving the zone', () => {
        const manager = new ObjectiveManager([
            {
                id: 'act',
                type: 'activate',
                label: 'Activate',
                zone: { id: 'z', x: 0, z: 0, size: 4 },
                dwellSeconds: 3
            }
        ]);
        manager.onZone(0, 0, 2);
        manager.onZone(10, 10, 1);
        manager.onZone(0, 0, 2);
        expect(manager.completedIds()).toEqual([]);
        manager.onZone(0, 0, 1);
        expect(manager.completedIds()).toEqual(['act']);
    });

    it('completes reach on entry and survive on its timer', () => {
        const manager = new ObjectiveManager([
            { id: 'reach', type: 'reach', label: 'Reach', zone: { id: 'z', x: 5, z: 5, size: 4 } },
            { id: 'survive', type: 'survive', label: 'Survive', surviveSeconds: 10 }
        ]);
        manager.onZone(0, 0, 1);
        expect(manager.completedIds()).toEqual([]);
        manager.onZone(5, 5, 0.1);
        expect(manager.completedIds()).toEqual(['reach']);
        manager.onTick(9);
        expect(manager.completedIds()).toEqual(['reach']);
        manager.onTick(1);
        expect(manager.allComplete()).toBe(true);
    });

    it('runs defend as dwell then a hold timer, and fails on a missed time limit', () => {
        const manager = new ObjectiveManager([
            {
                id: 'def',
                type: 'defend',
                label: 'Defend',
                zone: { id: 'z', x: 0, z: 0, size: 4 },
                dwellSeconds: 3,
                surviveSeconds: 5
            }
        ]);
        manager.onZone(0, 0, 3);
        expect(manager.completedIds()).toEqual([]);
        manager.onTick(5);
        expect(manager.completedIds()).toEqual(['def']);

        const timed = new ObjectiveManager([
            {
                id: 'race',
                type: 'reach',
                label: 'Race',
                zone: { id: 'z', x: 0, z: 0, size: 4 },
                timeLimitSeconds: 10
            }
        ]);
        timed.onTick(11);
        expect(timed.anyFailed()).toBe(true);
    });

    it('restores a checkpoint with partial progress on the current objective lost', () => {
        const manager = new ObjectiveManager([
            { id: 'a', type: 'eliminate', label: 'A', targetGroupId: 'g-a', count: 1 },
            { id: 'b', type: 'eliminate', label: 'B', targetGroupId: 'g-b', count: 2 }
        ]);
        manager.onKill('g-a');
        manager.onKill('g-b');
        manager.restore(['a']);
        expect(manager.completedIds()).toEqual(['a']);
        expect(manager.progressOf('b')?.current).toBe(0);
    });
});

describe('wave spawner', () => {
    const groups = [
        {
            id: 'g1',
            objectiveId: 'o1',
            patrolMode: 'loop' as const,
            spawns: [
                { id: 'e1', x: 0, z: 0 },
                { id: 'e2', x: 1, z: 1 }
            ]
        },
        {
            id: 'g2',
            objectiveId: 'o2',
            waveAfter: 'g1',
            patrolMode: 'loop' as const,
            spawns: [{ id: 'e3', x: 2, z: 2 }]
        }
    ];

    it('starts with initial groups and triggers the wave exactly once on full clear', () => {
        const spawner = new WaveSpawner(groups);
        expect(spawner.initialGroupIds()).toEqual(['g1']);
        expect(spawner.markDead('e1')).toBeNull();
        expect(spawner.markDead('e2')).toBe('g2');
        expect(spawner.markDead('e2')).toBeNull();
    });

    it('re-arms a respawned group after a checkpoint retry', () => {
        const spawner = new WaveSpawner(groups);
        spawner.markDead('e1');
        spawner.markDead('e2');
        expect(spawner.isSpawned('g2')).toBe(true);
        spawner.resetForGroups(['g1']);
        expect(spawner.markDead('e1')).toBeNull();
        expect(spawner.markDead('e2')).toBeNull();
    });
});

describe('checkpoints', () => {
    it('respawns only groups not tied to a completed eliminate objective', () => {
        const level = findLevel(4);
        expect(level).not.toBeNull();
        if (level === null) {
            return;
        }
        const checkpoints = new CheckpointManager({ x: 0, z: 10 });
        checkpoints.record('cp-l4-first', { x: 0, z: 0 }, ['l4-first'], 3);
        expect(checkpoints.respawnGroupIds(level)).toEqual(['l4-second']);
        expect(checkpoints.current().kills).toBe(3);
    });
});

describe('score, rank and unlock', () => {
    it('scores kills, accuracy and time bonus minus damage, floored at zero', () => {
        const result = calculateScore({
            kills: 3,
            accuracy: 80,
            timeSeconds: 100,
            damageReceived: 20,
            parSeconds: 180
        });
        expect(result.score).toBe(3 * 100 + 160 + 400 - 20);
        expect(result.rank).toBe('A');
    });

    it('ranks S at 1000, B at 400, and C below that', () => {
        expect(
            calculateScore({ kills: 10, accuracy: 100, timeSeconds: 0, damageReceived: 0, parSeconds: 300 }).rank
        ).toBe('S');
        expect(
            calculateScore({ kills: 3, accuracy: 50, timeSeconds: 300, damageReceived: 0, parSeconds: 300 }).rank
        ).toBe('B');
        expect(
            calculateScore({ kills: 0, accuracy: 0, timeSeconds: 300, damageReceived: 0, parSeconds: 60 }).rank
        ).toBe('C');
    });

    it('unlocks only the next level on success and nothing on failure', () => {
        expect(nextUnlockedLevel(1, 1, true)).toBe(2);
        expect(nextUnlockedLevel(5, 3, true)).toBe(5);
        expect(nextUnlockedLevel(5, 5, false)).toBe(5);
        expect(nextUnlockedLevel(10, 10, true)).toBe(11);
    });
});

describe('save migration', () => {
    it('falls back to the default for corrupt or missing data', () => {
        expect(normalizeSave(null).unlockedLevel).toBe(1);
        expect(normalizeSave({}).unlockedLevel).toBe(1);
        expect(normalizeSave({ schemaVersion: 2, unlockedLevel: 5, bestResults: {}, settings: {} }).unlockedLevel).toBe(
            1
        );
    });

    it('clamps the unlock frontier and drops malformed best entries', () => {
        const normalized = normalizeSave({
            schemaVersion: 1,
            unlockedLevel: 99,
            bestResults: {
                '1': { missionId: '1', kills: 3, accuracy: 100, timeSeconds: 60, damageReceived: 0, score: 900 },
                '2': { missionId: '2', kills: 'many' }
            },
            settings: {
                audio: { master: 0.8, music: 0.6, sfx: 0.8, muted: false },
                sensitivity: 1,
                quality: 'medium'
            }
        });
        expect(normalized.unlockedLevel).toBe(31);
        expect(Object.keys(normalized.bestResults)).toEqual(['1']);
    });
});
