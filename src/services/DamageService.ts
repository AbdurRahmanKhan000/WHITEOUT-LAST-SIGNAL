/**
 * Authoritative damage rules shared by player, enemies and targets
 * (SRS sections 5.3, 6-B). One place, so a target and an enemy can never
 * disagree about what a hit means.
 */
export interface DamageResult {
    readonly health: number;
    readonly died: boolean;
}

export function applyDamage(health: number, damage: number): DamageResult {
    const next = Math.max(0, health - damage);
    return { health: next, died: next <= 0 && health > 0 };
}
