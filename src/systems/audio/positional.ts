/**
 * Build 4 — positional audio maths (SRS FR-23, section 7-F).
 * Pure, unit-testable: given a world sound position and the listener
 * (camera) position, produce a volume attenuation and a stereo pan.
 * Pan is world-relative (left/right by world X offset), not head-
 * relative — the listener's facing is not tracked here, so a sound
 * directly behind the player pans the same as one in front at the
 * same X offset. That limitation is documented, not hidden.
 */
export interface PositionalGain {
    /** 0..1, full volume at the listener, floor 0.05 at max distance. */
    readonly volume: number;
    /** -1 (hard left) .. 1 (hard right). */
    readonly pan: number;
}

export function positionalGain(
    sound: readonly [number, number, number],
    listener: readonly [number, number, number],
    maxDistance = 40
): PositionalGain {
    const dx = sound[0] - listener[0];
    const dy = sound[1] - listener[1];
    const dz = sound[2] - listener[2];
    const distance = Math.hypot(dx, dy, dz);
    const volume = Math.max(0.05, 1 - distance / maxDistance);
    const pan = Math.max(-1, Math.min(1, (dx / maxDistance) * 1.4));
    return { volume, pan };
}
