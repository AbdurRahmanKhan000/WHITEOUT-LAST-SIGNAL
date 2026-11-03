import { raycastAabb } from '../../services/raycast';
import type { Aabb3 } from '../../services/raycast';

/**
 * Pure enemy perception (SRS section 6-B, Build 3 gate).
 * Seeing a player needs all three: within range, inside the field of
 * view, and a clear line of sight (no crate or wall box between eye and
 * chest). No PlayCanvas types here, so the rules are unit-testable.
 * The shared slab raycast from src/services/raycast.ts is used for the
 * line-of-sight test — there is no second slab implementation.
 */

export interface Vec2 {
    readonly x: number;
    readonly z: number;
}

export function distance2D(a: Vec2, b: Vec2): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Yaw whose forward vector (-sin yaw, -cos yaw) points along (dx, dz).
 * This is the same yaw convention as the player's forwardFromYaw.
 */
export function yawForDirection(dx: number, dz: number): number {
    if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) {
        return 0;
    }
    return Math.atan2(-dx, -dz);
}

export interface PerceptionInput {
    readonly enemy: Vec2;
    readonly enemyYaw: number;
    /** Eye height in metres above the ground. */
    readonly eyeHeight: number;
    readonly target: Vec2;
    /** Target chest height in metres above the target's ground position. */
    readonly targetHeight: number;
    readonly perceptionRange: number;
    readonly fovDegrees: number;
    readonly blockers: readonly Aabb3[];
}

export function canSee(input: PerceptionInput): boolean {
    const dx = input.target.x - input.enemy.x;
    const dz = input.target.z - input.enemy.z;
    const groundDistance = Math.hypot(dx, dz);
    // Strictly less than: a target exactly on the perception boundary is
    // out of range. This is what keeps the test-arena enemy at (0, -14)
    // from detecting a stationary player at the spawn (0, 6), exactly
    // 20 m away with a 20 m perception range.
    if (groundDistance >= input.perceptionRange) {
        return false;
    }
    if (groundDistance > 1e-6) {
        const facingX = -Math.sin(input.enemyYaw);
        const facingZ = -Math.cos(input.enemyYaw);
        const toTargetX = dx / groundDistance;
        const toTargetZ = dz / groundDistance;
        const cosAngle = Math.max(-1, Math.min(1, facingX * toTargetX + facingZ * toTargetZ));
        const angleDegrees = (Math.acos(cosAngle) * 180) / Math.PI;
        if (angleDegrees > input.fovDegrees / 2) {
            return false;
        }
    }
    // Line of sight: a ray from the eye to the chest. Any blocker hit
    // strictly before the target blocks the view. A low crate (top 1 m)
    // does not block a ray that passes over it at chest height.
    const eye = { x: input.enemy.x, y: input.eyeHeight, z: input.enemy.z };
    const chest = { x: input.target.x, y: input.targetHeight, z: input.target.z };
    const ray = { x: chest.x - eye.x, y: chest.y - eye.y, z: chest.z - eye.z };
    const length = Math.hypot(ray.x, ray.y, ray.z);
    if (length < 1e-6) {
        return true;
    }
    const direction = { x: ray.x / length, y: ray.y / length, z: ray.z / length };
    for (const blocker of input.blockers) {
        const hit = raycastAabb(eye, direction, blocker, length);
        if (hit !== null && hit < length - 1e-6) {
            return false;
        }
    }
    return true;
}

/** A gunshot is heard when its origin is within sound range. */
export function soundHeard(enemy: Vec2, origin: Vec2, soundRange: number): boolean {
    return distance2D(enemy, origin) <= soundRange;
}
