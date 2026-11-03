/**
 * Pure movement, collision and camera helpers (Build 1).
 * Kept free of PlayCanvas types so the rules are unit-testable in isolation:
 * the player never sinks through the floor, never penetrates a wall, and
 * the camera never clips through an obstacle.
 */

export interface Obstacle {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
    /** Height of the top of the obstacle, for camera collision. */
    readonly top: number;
}

export interface Vec2 {
    readonly x: number;
    readonly z: number;
}

export const ARENA_HALF_SIZE = 20;

function circleHitsObstacle(x: number, z: number, radius: number, obstacle: Obstacle): boolean {
    const closestX = Math.max(obstacle.minX, Math.min(x, obstacle.maxX));
    const closestZ = Math.max(obstacle.minZ, Math.min(z, obstacle.maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    return dx * dx + dz * dz < radius * radius;
}

export function collides(x: number, z: number, radius: number, obstacles: readonly Obstacle[]): boolean {
    return obstacles.some((obstacle) => circleHitsObstacle(x, z, radius, obstacle));
}

/**
 * Move with axis-separated collision resolution. Trying the full move, then
 * each axis alone, gives wall sliding instead of sticking, and never lets
 * the player end a frame inside an obstacle or outside the arena.
 */
export function moveWithCollisions(position: Vec2, delta: Vec2, radius: number, obstacles: readonly Obstacle[]): Vec2 {
    const clampToArena = (value: number): number =>
        Math.max(-ARENA_HALF_SIZE + radius, Math.min(ARENA_HALF_SIZE - radius, value));
    const candidate: Vec2 = { x: clampToArena(position.x + delta.x), z: clampToArena(position.z + delta.z) };
    if (!collides(candidate.x, candidate.z, radius, obstacles)) {
        return candidate;
    }
    const onlyX: Vec2 = { x: candidate.x, z: position.z };
    if (!collides(onlyX.x, onlyX.z, radius, obstacles)) {
        return onlyX;
    }
    const onlyZ: Vec2 = { x: position.x, z: candidate.z };
    if (!collides(onlyZ.x, onlyZ.z, radius, obstacles)) {
        return onlyZ;
    }
    return position;
}

/** Forward vector for a yaw rotation around Y, where yaw 0 faces -Z. */
export function forwardFromYaw(yaw: number): Vec2 {
    return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Right vector for the same yaw. */
export function rightFromYaw(yaw: number): Vec2 {
    return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

/**
 * Largest camera distance, up to maxDistance, whose point is not inside an
 * obstacle taller than the camera height. Steps inward from the desired
 * distance so the camera slides along cover instead of snapping.
 */
export function cameraDistance(
    target: { readonly x: number; readonly y: number; readonly z: number },
    direction: { readonly x: number; readonly y: number; readonly z: number },
    maxDistance: number,
    obstacles: readonly Obstacle[]
): number {
    const minDistance = 0.8;
    for (let distance = maxDistance; distance >= minDistance; distance -= 0.25) {
        const point = {
            x: target.x + direction.x * distance,
            y: target.y + direction.y * distance,
            z: target.z + direction.z * distance
        };
        const blocked = obstacles.some(
            (obstacle) =>
                point.y < obstacle.top &&
                point.x >= obstacle.minX - 0.3 &&
                point.x <= obstacle.maxX + 0.3 &&
                point.z >= obstacle.minZ - 0.3 &&
                point.z <= obstacle.maxZ + 0.3
        );
        if (!blocked) {
            return distance;
        }
    }
    return minDistance;
}

/** Frame-rate-independent exponential smoothing; no hard snapping. */
export function blend(current: number, target: number, rate: number, dt: number): number {
    if (dt <= 0) {
        return current;
    }
    return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function clampHealth(health: number, maximum: number): number {
    return Math.max(0, Math.min(maximum, health));
}
