import { describe, expect, it } from 'vitest';

import {
    GRUNT,
    HEAVY,
    SCOUT,
    definitionForVariant,
    enemyDefinitionForDifficulty,
    figureScaleForVariant
} from '../../src/data/enemies';
import { CATALOG, findLevel, validateCatalog, validateLevel } from '../../src/data/levels';
import { normalizeSave } from '../../src/services/SaveRepository';
import { nextUnlockedLevel } from '../../src/systems/mission/score';
import { WaveSpawner } from '../../src/systems/mission/WaveSpawner';

describe('build 6 enemy variants', () => {
    it('heavy is tougher, harder-hitting and slower than a grunt', () => {
        expect(HEAVY.health).toBeGreaterThan(GRUNT.health);
        expect(HEAVY.damage).toBeGreaterThan(GRUNT.damage);
        expect(HEAVY.chaseSpeed).toBeLessThan(GRUNT.chaseSpeed);
        expect(HEAVY.reloadSeconds).toBeGreaterThan(GRUNT.reloadSeconds);
    });

    it('scout is faster and wider-seeing but frailer and lighter-hitting', () => {
        expect(SCOUT.chaseSpeed).toBeGreaterThan(GRUNT.chaseSpeed);
        expect(SCOUT.perceptionRange).toBeGreaterThan(GRUNT.perceptionRange);
        expect(SCOUT.health).toBeLessThan(GRUNT.health);
        expect(SCOUT.damage).toBeLessThan(GRUNT.damage);
    });

    it('variant lookup returns the right definition and figure scale', () => {
        expect(definitionForVariant('heavy')).toBe(HEAVY);
        expect(definitionForVariant('scout')).toBe(SCOUT);
        expect(definitionForVariant('grunt')).toBe(GRUNT);
        expect(figureScaleForVariant('heavy')).toBeGreaterThan(figureScaleForVariant('grunt'));
        expect(figureScaleForVariant('scout')).toBeLessThan(figureScaleForVariant('grunt'));
    });

    it('difficulty scaling still applies on top of a variant', () => {
        const hardHeavy = enemyDefinitionForDifficulty(HEAVY, 'hard');
        expect(hardHeavy.health).toBe(HEAVY.health);
        expect(hardHeavy.damage).toBeGreaterThan(HEAVY.damage);
    });
});

describe('build 6 wave escalation', () => {
    it('triggerNextWave spawns the first unspawned wave exactly once', () => {
        const spawner = new WaveSpawner([
            { id: 'first', objectiveId: '', patrolMode: 'loop', spawns: [{ id: 'e1', x: 0, z: 0 }] },
            {
                id: 'second',
                objectiveId: '',
                waveAfter: 'first',
                patrolMode: 'loop',
                spawns: [{ id: 'e2', x: 0, z: 0 }]
            },
            {
                id: 'third',
                objectiveId: '',
                waveAfter: 'second',
                patrolMode: 'loop',
                spawns: [{ id: 'e3', x: 0, z: 0 }]
            }
        ]);
        expect(spawner.triggerNextWave()).toBe('second');
        expect(spawner.triggerNextWave()).toBe('third');
        expect(spawner.triggerNextWave()).toBeNull();
    });

    it('triggerNextWave never re-triggers a wave cleared the normal way', () => {
        const spawner = new WaveSpawner([
            { id: 'first', objectiveId: '', patrolMode: 'loop', spawns: [{ id: 'e1', x: 0, z: 0 }] },
            {
                id: 'second',
                objectiveId: '',
                waveAfter: 'first',
                patrolMode: 'loop',
                spawns: [{ id: 'e2', x: 0, z: 0 }]
            }
        ]);
        expect(spawner.markDead('e1')).toBe('second');
        expect(spawner.triggerNextWave()).toBeNull();
    });
});

describe('build 6 unlock chain 10 to 20', () => {
    it('completing each level unlocks exactly the next one', () => {
        for (let level = 10; level <= 20; level += 1) {
            expect(nextUnlockedLevel(level, level, true)).toBe(level + 1);
        }
    });

    it('failure never unlocks', () => {
        expect(nextUnlockedLevel(11, 11, false)).toBe(11);
    });

    it('the catalog still holds exactly 30 levels, all playable since Build 7', () => {
        expect(CATALOG.length).toBe(30);
        for (const entry of CATALOG) {
            expect(entry.playable).toBe(true);
            expect(entry.comingIn).toBeUndefined();
        }
    });

    it('levels 11-20 chain through nextLevelId and validate', () => {
        validateCatalog();
        for (let level = 11; level <= 20; level += 1) {
            const record = findLevel(level);
            expect(record).not.toBeNull();
            expect(record?.nextLevelId).toBe(level + 1);
        }
        expect(findLevel(15)?.name).toBe('Last Outpost');
        expect(findLevel(20)?.name).toBe('Underground Exit');
        expect(findLevel(12)?.perceptionMultiplier).toBe(0.6);
        // Build 7: Level 21 is playable now, not the frontier.
        expect(findLevel(21)?.name).toBe('Dead District');
    });

    it('validation rejects an unknown variant and a bad perception multiplier', () => {
        const base = findLevel(11);
        expect(base).not.toBeNull();
        if (base === null) {
            return;
        }
        expect(() =>
            validateLevel({
                ...base,
                enemySpawnGroups: [{ ...base.enemySpawnGroups[0], variant: 'boss' as never }]
            })
        ).toThrow();
        expect(() => validateLevel({ ...base, perceptionMultiplier: 0 })).toThrow();
        expect(() => validateLevel({ ...base, perceptionMultiplier: 1.5 })).toThrow();
    });

    it('save migration preserves the extended frontier and drops bad entries', () => {
        const saved = normalizeSave({
            schemaVersion: 1,
            unlockedLevel: 20,
            bestResults: {
                '11': { missionId: '11', kills: 6, accuracy: 80, timeSeconds: 200, damageReceived: 10, score: 900 },
                broken: { missionId: 'broken' }
            },
            settings: {
                audio: { master: 0.8, music: 0.6, sfx: 0.8, muted: false },
                sensitivity: 1,
                quality: 'medium'
            }
        });
        expect(saved.unlockedLevel).toBe(20);
        expect(saved.bestResults['11']?.score).toBe(900);
        expect(saved.bestResults['broken']).toBeUndefined();
    });
});
