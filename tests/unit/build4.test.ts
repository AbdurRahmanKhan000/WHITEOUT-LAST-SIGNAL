import { describe, expect, it } from 'vitest';

import { positionalGain } from '../../src/systems/audio/positional';
import { qualityProfile } from '../../src/systems/graphics/quality';
import { ArenaStats } from '../../src/systems/ui/arenaStats';

describe('quality profiles', () => {
    it('low disables shadows and caps effects and pixel ratio', () => {
        const profile = qualityProfile('low');
        expect(profile.castShadows).toBe(false);
        expect(profile.pixelRatioCap).toBe(1);
        expect(profile.maxEffects).toBe(12);
    });

    it('high exceeds medium on every runtime setting', () => {
        const medium = qualityProfile('medium');
        const high = qualityProfile('high');
        expect(high.pixelRatioCap).toBeGreaterThan(medium.pixelRatioCap);
        expect(high.shadowResolution).toBeGreaterThan(medium.shadowResolution);
        expect(high.maxEffects).toBeGreaterThan(medium.maxEffects);
        expect(high.castShadows).toBe(true);
    });

    it('medium keeps shadows on with a mid effect budget', () => {
        const profile = qualityProfile('medium');
        expect(profile.castShadows).toBe(true);
        expect(profile.maxEffects).toBe(24);
    });
});

describe('positional gain', () => {
    it('is full volume with no pan at the listener', () => {
        const gain = positionalGain([0, 0, 0], [0, 0, 0]);
        expect(gain.volume).toBe(1);
        expect(gain.pan).toBe(0);
    });

    it('attenuates with distance and never drops below the floor', () => {
        const near = positionalGain([10, 0, 0], [0, 0, 0]);
        const far = positionalGain([100, 0, 0], [0, 0, 0]);
        expect(near.volume).toBeLessThan(1);
        expect(near.volume).toBeGreaterThan(far.volume);
        expect(far.volume).toBe(0.05);
    });

    it('pans right for a sound to the right and left for one to the left', () => {
        expect(positionalGain([20, 0, 0], [0, 0, 0]).pan).toBeGreaterThan(0);
        expect(positionalGain([-20, 0, 0], [0, 0, 0]).pan).toBeLessThan(0);
    });
});

describe('arena stats', () => {
    it('counts shots, hits and kills and reports accuracy', () => {
        const stats = new ArenaStats();
        stats.reset(0);
        stats.onShot();
        stats.onShot();
        stats.onHit();
        stats.onKill();
        const summary = stats.summary(30, 3);
        expect(summary.shots).toBe(2);
        expect(summary.hits).toBe(1);
        expect(summary.kills).toBe(1);
        expect(summary.accuracy).toBe(50);
        expect(summary.timeSeconds).toBe(30);
        expect(summary.cleared).toBe(false);
    });

    it('caps shotgun-style accuracy at 100 and clears at the enemy total', () => {
        const stats = new ArenaStats();
        stats.reset(0);
        stats.onShot();
        stats.onHit();
        stats.onHit();
        stats.onHit();
        stats.onKill();
        stats.onKill();
        stats.onKill();
        const summary = stats.summary(10, 3);
        expect(summary.accuracy).toBe(100);
        expect(summary.cleared).toBe(true);
    });

    it('reports zero accuracy with no shots and resets cleanly', () => {
        const stats = new ArenaStats();
        stats.reset(5);
        stats.onShot();
        stats.reset(10);
        const summary = stats.summary(20, 3);
        expect(summary.shots).toBe(0);
        expect(summary.accuracy).toBe(0);
        expect(summary.timeSeconds).toBe(10);
    });
});
