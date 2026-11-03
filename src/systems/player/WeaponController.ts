import type { EventBus } from '../../core/EventBus';
import { WEAPONS } from '../../data/weapons';
import type { WeaponDefinition, WeaponId } from '../../data/weapons';

/**
 * Weapon state machine (SRS section 6-A, FR-06).
 * Enforces magazine size, reserve, fire interval, reload duration, fire
 * mode is enforced by the caller (hold for auto, click for semi) and
 * switching rules. Reload is blocked when the magazine is full or a
 * reload is already running; switching cancels a reload.
 */
export type FireResult =
    | { readonly kind: 'fired'; readonly definition: WeaponDefinition; readonly shotId: string }
    | { readonly kind: 'empty' }
    | { readonly kind: 'blocked' };

export class WeaponController {
    private current: WeaponId = 'rifle';
    private readonly magazines = new Map<WeaponId, number>();
    private readonly reserves = new Map<WeaponId, number>();
    private cooldown = 0;
    private switchLock = 0;
    private reloading = false;
    private reloadTimer = 0;
    private shotCounter = 0;
    private readonly eventBus: EventBus;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.reset();
    }

    reset(): void {
        for (const [id, definition] of Object.entries(WEAPONS) as [WeaponId, WeaponDefinition][]) {
            this.magazines.set(id, definition.magazineSize);
            this.reserves.set(id, definition.startingReserve);
        }
        this.current = 'rifle';
        this.cooldown = 0;
        this.switchLock = 0;
        this.reloading = false;
        this.reloadTimer = 0;
    }

    get currentId(): WeaponId {
        return this.current;
    }

    get definition(): WeaponDefinition {
        return WEAPONS[this.current];
    }

    get magazine(): number {
        return this.magazines.get(this.current) ?? 0;
    }

    get reserve(): number {
        return this.reserves.get(this.current) ?? 0;
    }

    get isReloading(): boolean {
        return this.reloading;
    }

    update(dt: number): void {
        if (this.cooldown > 0) {
            this.cooldown = Math.max(0, this.cooldown - dt);
        }
        if (this.switchLock > 0) {
            this.switchLock = Math.max(0, this.switchLock - dt);
        }
        if (!this.reloading) {
            return;
        }
        this.reloadTimer -= dt;
        if (this.reloadTimer > 0) {
            return;
        }
        this.reloading = false;
        const definition = this.definition;
        const magazine = this.magazines.get(this.current) ?? 0;
        const reserve = this.reserves.get(this.current) ?? 0;
        const transfer = Math.min(definition.magazineSize - magazine, reserve);
        this.magazines.set(this.current, magazine + transfer);
        this.reserves.set(this.current, reserve - transfer);
        this.eventBus.emit('weapon.reloadCompleted', {
            weaponId: this.current,
            magazine: this.magazine,
            reserve: this.reserve
        });
        this.eventBus.emit('player.ammoChanged', {
            weaponId: this.current,
            magazine: this.magazine,
            reserve: this.reserve
        });
    }

    tryFire(origin: readonly [number, number, number], direction: readonly [number, number, number]): FireResult {
        if (this.reloading || this.cooldown > 0 || this.switchLock > 0) {
            return { kind: 'blocked' };
        }
        const magazine = this.magazines.get(this.current) ?? 0;
        if (magazine <= 0) {
            this.startReload();
            return { kind: 'empty' };
        }
        this.magazines.set(this.current, magazine - 1);
        this.cooldown = this.definition.fireIntervalSeconds;
        this.shotCounter += 1;
        const shotId = `shot-${this.shotCounter}`;
        this.eventBus.emit('weapon.fired', {
            ownerId: 'player',
            weaponId: this.current,
            origin,
            direction,
            shotId
        });
        this.eventBus.emit('player.ammoChanged', {
            weaponId: this.current,
            magazine: this.magazine,
            reserve: this.reserve
        });
        return { kind: 'fired', definition: this.definition, shotId };
    }

    startReload(): boolean {
        if (this.reloading) {
            return false;
        }
        const definition = this.definition;
        if (this.magazine >= definition.magazineSize || this.reserve <= 0) {
            return false;
        }
        this.reloading = true;
        this.reloadTimer = definition.reloadSeconds;
        this.eventBus.emit('weapon.reloadStarted', { weaponId: this.current });
        return true;
    }

    switchTo(id: WeaponId): boolean {
        if (id === this.current) {
            return false;
        }
        this.current = id;
        this.reloading = false;
        this.switchLock = 0.3;
        this.eventBus.emit('player.ammoChanged', {
            weaponId: this.current,
            magazine: this.magazine,
            reserve: this.reserve
        });
        return true;
    }
}
