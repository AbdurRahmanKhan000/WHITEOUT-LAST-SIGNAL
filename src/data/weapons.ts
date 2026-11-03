/**
 * Weapon balance data (SRS sections 6-A, 8, 12). Balancing lives in data,
 * never in hard-coded conditionals in the controller.
 */
export type WeaponId = 'rifle' | 'pistol' | 'shotgun';

export type FireMode = 'auto' | 'semi';

export interface WeaponDefinition {
    readonly id: WeaponId;
    readonly name: string;
    readonly fireMode: FireMode;
    readonly fireIntervalSeconds: number;
    readonly magazineSize: number;
    readonly startingReserve: number;
    readonly reloadSeconds: number;
    readonly damagePerPellet: number;
    readonly pellets: number;
    /** Random cone half-angle in radians applied per pellet. */
    readonly spreadRadians: number;
    readonly range: number;
    /** Pitch kick in radians per trigger pull. */
    readonly recoilPitch: number;
}

export const WEAPONS: Readonly<Record<WeaponId, WeaponDefinition>> = {
    rifle: {
        id: 'rifle',
        name: 'Assault Rifle',
        fireMode: 'auto',
        fireIntervalSeconds: 0.1,
        magazineSize: 30,
        startingReserve: 120,
        reloadSeconds: 2.2,
        damagePerPellet: 25,
        pellets: 1,
        spreadRadians: 0.015,
        range: 60,
        recoilPitch: 0.012
    },
    pistol: {
        id: 'pistol',
        name: 'Pistol',
        fireMode: 'semi',
        fireIntervalSeconds: 0.25,
        magazineSize: 12,
        startingReserve: 60,
        reloadSeconds: 1.4,
        damagePerPellet: 20,
        pellets: 1,
        spreadRadians: 0.01,
        range: 50,
        recoilPitch: 0.008
    },
    shotgun: {
        id: 'shotgun',
        name: 'Shotgun',
        fireMode: 'semi',
        fireIntervalSeconds: 0.8,
        magazineSize: 6,
        startingReserve: 30,
        reloadSeconds: 2.8,
        damagePerPellet: 8,
        pellets: 6,
        spreadRadians: 0.06,
        range: 25,
        recoilPitch: 0.02
    }
};

export const WEAPON_ORDER: readonly WeaponId[] = ['rifle', 'pistol', 'shotgun'];
