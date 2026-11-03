import { describe, expect, it } from 'vitest';

import {
    blend,
    cameraDistance,
    clampHealth,
    forwardFromYaw,
    moveWithCollisions
} from '../../src/systems/player/movement';
import type { Obstacle } from '../../src/systems/player/movement';
import { PlayerAnimation } from '../../src/systems/player/PlayerAnimation';

const CRATE: Obstacle = { minX: 5, maxX: 7, minZ: -5, maxZ: -3, top: 1.2 };

describe('moveWithCollisions', () => {
    it('moves freely in open ground', () => {
        const next = moveWithCollisions({ x: 0, z: 0 }, { x: 1, z: 0 }, 0.45, [CRATE]);
        expect(next).toEqual({ x: 1, z: 0 });
    });

    it('never ends inside an obstacle, and slides along it', () => {
        // Straight into the crate: x is blocked, z still moves.
        const next = moveWithCollisions({ x: 4.4, z: -4 }, { x: 1, z: 0.5 }, 0.45, [CRATE]);
        expect(next.x).toBeLessThan(5);
        expect(next.z).toBe(-3.5);
    });

    it('clamps to the arena bounds', () => {
        const next = moveWithCollisions({ x: 19.5, z: 0 }, { x: 5, z: 0 }, 0.45, []);
        expect(next.x).toBeCloseTo(19.55);
    });
});

describe('cameraDistance', () => {
    it('returns the full distance in open ground', () => {
        const distance = cameraDistance({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: 1 }, 4, [CRATE]);
        expect(distance).toBe(4);
    });

    it('pulls the camera in front of a tall obstacle', () => {
        const tall: Obstacle = { minX: -2, maxX: 2, minZ: 2, maxZ: 4, top: 3 };
        const distance = cameraDistance({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: 1 }, 4, [tall]);
        expect(distance).toBeLessThan(2);
        expect(distance).toBeGreaterThanOrEqual(0.8);
    });
});

describe('forwardFromYaw', () => {
    it('faces -Z at yaw 0 and -X at yaw -PI/2', () => {
        const facing = forwardFromYaw(0);
        expect(facing.x).toBeCloseTo(0);
        expect(facing.z).toBe(-1);
        const turned = forwardFromYaw(-Math.PI / 2);
        expect(turned.x).toBeCloseTo(1);
        expect(turned.z).toBeCloseTo(0);
    });
});

describe('blend and health', () => {
    it('eases toward the target without overshooting', () => {
        const value = blend(0, 10, 8, 0.1);
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThan(10);
        expect(clampHealth(120, 100)).toBe(100);
        expect(clampHealth(-5, 100)).toBe(0);
    });

    it('animation blends speed instead of snapping', () => {
        const animation = new PlayerAnimation();
        const first = animation.update(0.016, 4.5, false, true);
        expect(first.smoothedSpeed).toBeGreaterThan(0);
        expect(first.smoothedSpeed).toBeLessThan(4.5);
        const stopped = animation.update(0.5, 0, false, true);
        expect(stopped.smoothedSpeed).toBeLessThan(first.smoothedSpeed);
    });
});
