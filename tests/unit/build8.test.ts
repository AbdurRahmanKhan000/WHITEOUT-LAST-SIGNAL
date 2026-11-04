import { describe, expect, it } from 'vitest';

import { CATALOG, LEVELS, findLevel, validateCatalog, validateLevel } from '../../src/data/levels';
import { nextUnlockedLevel } from '../../src/systems/mission/score';

/**
 * Build 8 — campaign completeness regression (SRS sections 8, 11).
 * Proves in data that v1.0 ships exactly 30 playable levels in the
 * SRS order, stage and difficulty mapping, with a nextLevelId chain
 * from 1 to 30 and a null terminator, so no level can silently go
 * missing or unplayable in a later edit.
 */
const EXPECTED_STAGE: readonly [number, number, string, string][] = [
    [1, 3, 'Training', 'Easy'],
    [4, 8, 'Operations', 'Moderate'],
    [9, 15, 'Combat Zone', 'Hard'],
    [16, 22, 'Special Operations', 'Very Hard'],
    [23, 27, 'Final Campaign', 'Extreme'],
    [28, 30, 'Final Showdown', 'Elite']
];

function expectedStageDifficulty(id: number): { stage: string; difficulty: string } {
    for (const [from, to, stage, difficulty] of EXPECTED_STAGE) {
        if (id >= from && id <= to) {
            return { stage, difficulty };
        }
    }
    throw new Error(`No SRS stage for level ${id}`);
}

describe('campaign completeness', () => {
    it('contains exactly 30 levels, ids 1-30 in order', () => {
        expect(LEVELS.length).toBe(30);
        expect(CATALOG.length).toBe(30);
        expect(LEVELS.map((level) => level.id)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    });

    it('has unique names and all levels playable', () => {
        const names = LEVELS.map((level) => level.name);
        expect(new Set(names).size).toBe(30);
        expect(CATALOG.every((entry) => entry.playable)).toBe(true);
    });

    it('matches the SRS stage and difficulty mapping for every level', () => {
        for (const level of LEVELS) {
            const expected = expectedStageDifficulty(level.id);
            expect(level.stage).toBe(expected.stage);
            expect(level.difficulty).toBe(expected.difficulty);
        }
    });

    it('chains nextLevelId 1 to 30 and terminates at null', () => {
        for (const level of LEVELS) {
            expect(level.nextLevelId).toBe(level.id < 30 ? level.id + 1 : null);
        }
        expect(findLevel(30)?.nextLevelId).toBeNull();
        expect(findLevel(31)).toBeNull();
    });

    it('passes the catalog validator without throwing', () => {
        expect(() => validateCatalog()).not.toThrow();
        for (const level of LEVELS) {
            expect(() => validateLevel(level)).not.toThrow();
        }
    });

    it('completing level 30 moves the frontier to 31, campaign complete', () => {
        expect(nextUnlockedLevel(30, 30, true)).toBe(31);
        // Frontier 31 is stable: replaying level 30 cannot push it further.
        expect(nextUnlockedLevel(31, 30, true)).toBe(31);
        // Defeat never unlocks.
        expect(nextUnlockedLevel(5, 5, false)).toBe(5);
    });
});
