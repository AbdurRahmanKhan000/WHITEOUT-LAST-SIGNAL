/**
 * Pure ray-vs-box hit detection (SRS FR-07).
 * A ray is tested against axis-aligned boxes with the slab method; the
 * nearest hit wins, so a crate in front of a target blocks the shot.
 * No PlayCanvas types here, so the maths is unit-testable.
 */

export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface Aabb3 {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
    readonly minZ: number;
    readonly maxZ: number;
}

export function raycastAabb(origin: Vec3, direction: Vec3, box: Aabb3, maxDistance: number): number | null {
    let tMin = 0;
    let tMax = maxDistance;
    const axes: readonly (readonly [number, number, number, number])[] = [
        [origin.x, direction.x, box.minX, box.maxX],
        [origin.y, direction.y, box.minY, box.maxY],
        [origin.z, direction.z, box.minZ, box.maxZ]
    ];
    for (const [o, d, min, max] of axes) {
        if (Math.abs(d) < 1e-9) {
            if (o < min || o > max) {
                return null;
            }
            continue;
        }
        let t1 = (min - o) / d;
        let t2 = (max - o) / d;
        if (t1 > t2) {
            const swap = t1;
            t1 = t2;
            t2 = swap;
        }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) {
            return null;
        }
    }
    return tMin;
}

export type RaycastHit =
    | { readonly kind: 'target'; readonly id: string; readonly distance: number; readonly point: Vec3 }
    | { readonly kind: 'blocker'; readonly distance: number; readonly point: Vec3 }
    | { readonly kind: 'none'; readonly point: Vec3 };

function pointAt(origin: Vec3, direction: Vec3, distance: number): Vec3 {
    return {
        x: origin.x + direction.x * distance,
        y: origin.y + direction.y * distance,
        z: origin.z + direction.z * distance
    };
}

export function raycastScene(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    targets: readonly { readonly id: string; readonly aabb: Aabb3 }[],
    blockers: readonly Aabb3[]
): RaycastHit {
    let bestTarget: { id: string; distance: number } | null = null;
    for (const target of targets) {
        const distance = raycastAabb(origin, direction, target.aabb, maxDistance);
        if (distance !== null && (bestTarget === null || distance < bestTarget.distance)) {
            bestTarget = { id: target.id, distance };
        }
    }
    let bestBlocker: number | null = null;
    for (const blocker of blockers) {
        const distance = raycastAabb(origin, direction, blocker, maxDistance);
        if (distance !== null && (bestBlocker === null || distance < bestBlocker)) {
            bestBlocker = distance;
        }
    }
    if (bestTarget !== null && (bestBlocker === null || bestTarget.distance <= bestBlocker)) {
        return {
            kind: 'target',
            id: bestTarget.id,
            distance: bestTarget.distance,
            point: pointAt(origin, direction, bestTarget.distance)
        };
    }
    if (bestBlocker !== null) {
        return { kind: 'blocker', distance: bestBlocker, point: pointAt(origin, direction, bestBlocker) };
    }
    return { kind: 'none', point: pointAt(origin, direction, maxDistance) };
}
