/**
 * Waypoint navigation (SRS section 6-B, Build 3 gate).
 * Navigation is A* over an authored waypoint graph — there is no assumed
 * navmesh. Edges exist only between waypoints whose straight segment does
 * not pass through an expanded crate box, so a path never leads an enemy
 * through an obstacle. A goal inside an expanded crate, or outside the
 * arena, is unreachable and returns an empty path, never a loop: A* keeps
 * a closed set, so no waypoint can repeat.
 */

export interface GraphPoint {
    readonly x: number;
    readonly z: number;
}

export interface GraphWaypoint extends GraphPoint {
    readonly id: string;
}

export interface GraphBox {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
}

interface Edge {
    readonly to: number;
    readonly cost: number;
}

function pointInBox(point: GraphPoint, box: GraphBox): boolean {
    return point.x >= box.minX && point.x <= box.maxX && point.z >= box.minZ && point.z <= box.maxZ;
}

/** True when the segment p -> q touches or crosses the box (slab method). */
function segmentHitsBox(p: GraphPoint, q: GraphPoint, box: GraphBox): boolean {
    let tMin = 0;
    let tMax = 1;
    const axes: readonly (readonly [number, number, number, number])[] = [
        [p.x, q.x - p.x, box.minX, box.maxX],
        [p.z, q.z - p.z, box.minZ, box.maxZ]
    ];
    for (const [origin, delta, min, max] of axes) {
        if (Math.abs(delta) < 1e-9) {
            if (origin < min || origin > max) {
                return false;
            }
            continue;
        }
        let t1 = (min - origin) / delta;
        let t2 = (max - origin) / delta;
        if (t1 > t2) {
            const swap = t1;
            t1 = t2;
            t2 = swap;
        }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) {
            return false;
        }
    }
    return true;
}

export class NavigationGraph {
    private readonly waypoints: readonly GraphWaypoint[];
    private readonly boxes: readonly GraphBox[];
    private readonly arenaHalf: number;
    private readonly edges: readonly (readonly Edge[])[];

    constructor(waypoints: readonly GraphWaypoint[], crates: readonly GraphBox[], clearance = 0.5, arenaHalf = 20) {
        this.waypoints = waypoints;
        this.arenaHalf = arenaHalf;
        this.boxes = crates.map((crate) => ({
            minX: crate.minX - clearance,
            maxX: crate.maxX + clearance,
            minZ: crate.minZ - clearance,
            maxZ: crate.maxZ + clearance
        }));
        const edges: Edge[][] = waypoints.map(() => []);
        for (let i = 0; i < waypoints.length; i += 1) {
            for (let j = i + 1; j < waypoints.length; j += 1) {
                if (this.segmentClear(waypoints[i], waypoints[j])) {
                    const cost = Math.hypot(waypoints[i].x - waypoints[j].x, waypoints[i].z - waypoints[j].z);
                    edges[i].push({ to: j, cost });
                    edges[j].push({ to: i, cost });
                }
            }
        }
        this.edges = edges;
    }

    /** The waypoint nearest to a point (ties keep the earlier waypoint). */
    nearestWaypoint(point: GraphPoint): GraphWaypoint {
        let best = this.waypoints[0];
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const waypoint of this.waypoints) {
            const distance = Math.hypot(waypoint.x - point.x, waypoint.z - point.z);
            if (distance < bestDistance) {
                best = waypoint;
                bestDistance = distance;
            }
        }
        return best;
    }

    /**
     * A* path from start to goal, as points to walk through in order.
     * The returned path excludes the start point and ends with the goal
     * point itself. A direct segment, when clear, returns just [goal].
     * Unreachable goals return [].
     */
    findPath(start: GraphPoint, goal: GraphPoint): readonly GraphPoint[] {
        if (!this.inBounds(goal) || this.boxes.some((box) => pointInBox(goal, box))) {
            return [];
        }
        if (!this.inBounds(start)) {
            return [];
        }
        // Nodes: 0..n-1 are waypoints, n is the start, n+1 is the goal.
        const n = this.waypoints.length;
        const startNode = n;
        const goalNode = n + 1;
        const points: readonly GraphPoint[] = [...this.waypoints, start, goal];
        const neighbours = (node: number): readonly Edge[] => {
            if (node === startNode) {
                // Start edges use sampling, not the slab test: an enemy
                // standing against a crate face has its centre inside the
                // expanded box (radius 0.45 < clearance 0.5), so a slab
                // test would call every edge from it "intersecting" at
                // t = 0 and the enemy could never path again. Sampling
                // from 0.25 m onward lets it leave the box it touches
                // while still rejecting any segment that passes through
                // a box further along.
                const list: Edge[] = [];
                for (let i = 0; i < n; i += 1) {
                    if (this.segmentClearFrom(start, this.waypoints[i])) {
                        list.push({
                            to: i,
                            cost: Math.hypot(start.x - this.waypoints[i].x, start.z - this.waypoints[i].z)
                        });
                    }
                }
                if (this.segmentClearFrom(start, goal)) {
                    list.push({ to: goalNode, cost: Math.hypot(start.x - goal.x, start.z - goal.z) });
                }
                return list;
            }
            if (node === goalNode) {
                return [];
            }
            const list: Edge[] = [...this.edges[node]];
            if (this.segmentClear(this.waypoints[node], goal)) {
                list.push({
                    to: goalNode,
                    cost: Math.hypot(this.waypoints[node].x - goal.x, this.waypoints[node].z - goal.z)
                });
            }
            return list;
        };
        const heuristic = (node: number): number => Math.hypot(points[node].x - goal.x, points[node].z - goal.z);
        const gScore = new Map<number, number>([[startNode, 0]]);
        const cameFrom = new Map<number, number>();
        const closed = new Set<number>();
        const open: number[] = [startNode];
        while (open.length > 0) {
            let bestIndex = 0;
            for (let i = 1; i < open.length; i += 1) {
                const node = open[i];
                const current = open[bestIndex];
                const nodeScore = (gScore.get(node) ?? Number.POSITIVE_INFINITY) + heuristic(node);
                const currentScore = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + heuristic(current);
                if (nodeScore < currentScore) {
                    bestIndex = i;
                }
            }
            const current = open.splice(bestIndex, 1)[0];
            if (current === goalNode) {
                const path: GraphPoint[] = [];
                let node = goalNode;
                while (node !== startNode) {
                    path.unshift(points[node]);
                    const previous = cameFrom.get(node);
                    if (previous === undefined) {
                        break;
                    }
                    node = previous;
                }
                return path;
            }
            closed.add(current);
            for (const edge of neighbours(current)) {
                if (closed.has(edge.to)) {
                    continue;
                }
                const tentative = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + edge.cost;
                if (tentative < (gScore.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
                    cameFrom.set(edge.to, current);
                    gScore.set(edge.to, tentative);
                    if (!open.includes(edge.to)) {
                        open.push(edge.to);
                    }
                }
            }
        }
        return [];
    }

    private inBounds(point: GraphPoint): boolean {
        return Math.abs(point.x) <= this.arenaHalf && Math.abs(point.z) <= this.arenaHalf;
    }

    private segmentClear(a: GraphPoint, b: GraphPoint): boolean {
        if (!this.inBounds(a) || !this.inBounds(b)) {
            return false;
        }
        return !this.boxes.some((box) => segmentHitsBox(a, b, box));
    }

    /** Sampling version of segmentClear, for edges leaving the start point. */
    private segmentClearFrom(a: GraphPoint, b: GraphPoint): boolean {
        if (!this.inBounds(a) || !this.inBounds(b)) {
            return false;
        }
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 1e-9) {
            return true;
        }
        for (let distance = 0.25; distance < length; distance += 0.25) {
            const point = {
                x: a.x + ((b.x - a.x) * distance) / length,
                z: a.z + ((b.z - a.z) * distance) / length
            };
            if (this.boxes.some((box) => pointInBox(point, box))) {
                return false;
            }
        }
        return true;
    }
}
