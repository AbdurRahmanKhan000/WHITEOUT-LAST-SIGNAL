import { describe, expect, it } from 'vitest';

import { EventBus } from '../../src/core/EventBus';
import { applyDamage } from '../../src/services/DamageService';
import { raycastAabb, raycastScene } from '../../src/systems/player/raycast';
import { WeaponController } from '../../src/systems/player/WeaponController';

describe('DamageService', () => {
    it('reduces health and reports death exactly at zero', () => {
        expect(applyDamage(50, 25)).toEqual({ health: 25, died: false });
        expect(applyDamage(25, 25)).toEqual({ health: 0, died: true });
        expect(applyDamage(0, 25)).toEqual({ health: 0, died: false });
        expect(applyDamage(10, 100)).toEqual({ health: 0, died: true });
    });
});

describe('raycast', () => {
    const box = { minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: 5, maxZ: 7 };

    it('hits a box in front and misses one to the side', () => {
        expect(raycastAabb({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, box, 20)).toBe(5);
        expect(raycastAabb({ x: 5, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, box, 20)).toBeNull();
    });

    it('a blocker in front of a target wins', () => {
        const blocker = { minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: 2, maxZ: 3 };
        const hit = raycastScene(
            { x: 0, y: 1, z: 0 },
            { x: 0, y: 0, z: 1 },
            20,
            [{ id: 'target-1', aabb: box }],
            [blocker]
        );
        expect(hit.kind).toBe('blocker');
        if (hit.kind === 'blocker') {
            expect(hit.distance).toBe(2);
        }
    });
});

describe('WeaponController', () => {
    it('fires, counts down the magazine, and blocks on cooldown', () => {
        const bus = new EventBus();
        const weapons = new WeaponController(bus);
        expect(weapons.definition.id).toBe('rifle');
        expect(weapons.magazine).toBe(30);
        const first = weapons.tryFire([0, 0, 0], [0, 0, -1]);
        expect(first.kind).toBe('fired');
        expect(weapons.magazine).toBe(29);
        expect(weapons.tryFire([0, 0, 0], [0, 0, -1]).kind).toBe('blocked');
        weapons.update(0.1);
        expect(weapons.tryFire([0, 0, 0], [0, 0, -1]).kind).toBe('fired');
    });

    it('auto-reloads on empty and refills from reserve, capped by magazine size', () => {
        const bus = new EventBus();
        const weapons = new WeaponController(bus);
        weapons.switchTo('pistol');
        weapons.update(0.3);
        for (let i = 0; i < 12; i += 1) {
            weapons.update(0.25);
            expect(weapons.tryFire([0, 0, 0], [0, 0, -1]).kind).toBe('fired');
        }
        expect(weapons.magazine).toBe(0);
        weapons.update(0.25);
        expect(weapons.tryFire([0, 0, 0], [0, 0, -1]).kind).toBe('empty');
        expect(weapons.isReloading).toBe(true);
        weapons.update(1.4);
        expect(weapons.isReloading).toBe(false);
        expect(weapons.magazine).toBe(12);
        expect(weapons.reserve).toBe(48);
    });

    it('refuses reload when full, and switching cancels a reload', () => {
        const bus = new EventBus();
        const weapons = new WeaponController(bus);
        expect(weapons.startReload()).toBe(false);
        weapons.update(0.1);
        weapons.tryFire([0, 0, 0], [0, 0, -1]);
        expect(weapons.startReload()).toBe(true);
        expect(weapons.switchTo('pistol')).toBe(true);
        expect(weapons.isReloading).toBe(false);
        expect(weapons.currentId).toBe('pistol');
    });
});
