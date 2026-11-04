import { describe, expect, it } from 'vitest';

import { COMMANDER, GRUNT, HEAVY, definitionForVariant, figureScaleForVariant } from '../../src/data/enemies';
import { CATALOG, findLevel, validateCatalog, validateLevel } from '../../src/data/levels';
import { normalizeSave } from '../../src/services/SaveRepository';
import { nextUnlockedLevel } from '../../src/systems/mission/score';

describe('commander variant balance', () => {
    it('is the toughest, hardest-hitting, slowest and largest unit', () => {
        expect(COMMANDER.health).toBeGreaterThan(HEAVY.health);
        expect(HEAVY.health).toBeGreaterThan(GRUNT.health);
        expect(COMMANDER.damage).toBeGreaterThan(HEAVY.damage);
        expect(HEAVY.damage).toBeGreaterThan(GRUNT.damage);
        expect(COMMANDER.chaseSpeed).toBeLessThan(GRUNT.chaseSpeed);
        expect(COMMANDER.reloadSeconds).toBeGreaterThan(HEAVY.reloadSeconds);
        expect(COMMANDER.stunSeconds).toBeLessThan(GRUNT.stunSeconds);
        expect(definitionForVariant('commander')).toBe(COMMANDER);
        expect(figureScaleForVariant('commander')).toBeGreaterThan(figureScaleForVariant('heavy'));
        expect(figureScaleForVariant('commander')).toBe(1.5);
    });

    it('is used by the Level 27, 29 and 30 commander encounters', () => {
        for (const levelId of [27, 29, 30]) {
            const level = findLevel(levelId);
            expect(level).not.toBeNull();
            expect(level?.enemySpawnGroups.some((group) => group.variant === 'commander')).toBe(true);
        }
        expect(findLevel(21)?.enemySpawnGroups.some((group) => group.variant === 'commander')).toBe(false);
    });
});

describe('levels 21-30 catalog and chain', () => {
    it('holds exactly 30 playable levels with no locked summaries left', () => {
        validateCatalog();
        expect(CATALOG.length).toBe(30);
        for (const entry of CATALOG) {
            expect(entry.playable).toBe(true);
            expect(entry.comingIn).toBeUndefined();
        }
    });

    it('chains 20 through 30 in sequence and ends at Level 30', () => {
        for (let level = 20; level <= 29; level += 1) {
            expect(findLevel(level)?.nextLevelId).toBe(level + 1);
        }
        expect(findLevel(30)?.nextLevelId).toBeNull();
        expect(findLevel(21)?.name).toBe('Dead District');
        expect(findLevel(22)?.name).toBe('Rooftop Corridor');
        expect(findLevel(30)?.name).toBe('Last Signal');
    });

    it('uses the SRS stages and difficulties for the final campaign', () => {
        expect(findLevel(21)?.stage).toBe('Special Operations');
        expect(findLevel(22)?.stage).toBe('Special Operations');
        expect(findLevel(21)?.difficulty).toBe('Very Hard');
        for (const levelId of [23, 24, 25, 26, 27]) {
            expect(findLevel(levelId)?.stage).toBe('Final Campaign');
            expect(findLevel(levelId)?.difficulty).toBe('Extreme');
        }
        for (const levelId of [28, 29, 30]) {
            expect(findLevel(levelId)?.stage).toBe('Final Showdown');
            expect(findLevel(levelId)?.difficulty).toBe('Elite');
        }
    });

    it('validates every late level, including commander groups', () => {
        for (let levelId = 21; levelId <= 30; levelId += 1) {
            const level = findLevel(levelId);
            expect(level).not.toBeNull();
            if (level !== null) {
                expect(() => validateLevel(level)).not.toThrow();
            }
        }
    });

    it('escalates defend hold timers toward the finale', () => {
        const defendSeconds = (levelId: number): number | undefined => {
            const level = findLevel(levelId);
            return level?.objectives.find((objective) => objective.type === 'defend')?.surviveSeconds;
        };
        expect(defendSeconds(23)).toBe(60);
        expect(defendSeconds(26)).toBe(90);
        expect(defendSeconds(29)).toBe(90);
    });
});

describe('campaign-complete unlock chain and save integrity', () => {
    it('unlocks 21 after 20 and walks the chain to frontier 31', () => {
        expect(nextUnlockedLevel(20, 20, true)).toBe(21);
        expect(nextUnlockedLevel(21, 21, true)).toBe(22);
        expect(nextUnlockedLevel(29, 29, true)).toBe(30);
        expect(nextUnlockedLevel(30, 30, true)).toBe(31);
        expect(nextUnlockedLevel(31, 30, true)).toBe(31);
        expect(nextUnlockedLevel(30, 30, false)).toBe(30);
    });

    it('clamps the saved frontier to 1..31 and never resets a completed campaign', () => {
        const base = {
            schemaVersion: 1,
            bestResults: {},
            settings: {
                audio: { master: 0.8, music: 0.6, sfx: 0.8, muted: false },
                sensitivity: 1,
                quality: 'medium'
            }
        };
        expect(normalizeSave({ ...base, unlockedLevel: 31 }).unlockedLevel).toBe(31);
        expect(normalizeSave({ ...base, unlockedLevel: 99 }).unlockedLevel).toBe(31);
        expect(normalizeSave({ ...base, unlockedLevel: 0 }).unlockedLevel).toBe(1);
        expect(normalizeSave({ ...base, unlockedLevel: 21 }).unlockedLevel).toBe(21);
        expect(normalizeSave({ schemaVersion: 1, unlockedLevel: 'nope' }).unlockedLevel).toBe(1);
    });
});
