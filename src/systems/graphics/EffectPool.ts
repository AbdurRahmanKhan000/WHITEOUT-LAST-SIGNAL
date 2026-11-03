/**
 * Build 4 — pooled visual effects (SRS section 6-C, FR-13).
 * Impact bursts, smoke puffs and explosion flashes are pooled mesh
 * entities, never spawned without a cap: the pool reuses a fixed set
 * of small boxes/spheres, so a long firefight cannot accumulate
 * unbounded temporary entities (NFR-08). This is honest greybox
 * effects work, not GPU particle textures — no particle asset is
 * shipped, and the pool is the documented step toward them.
 */
import type { Entity } from 'playcanvas';
import { Entity as PlayEntity } from 'playcanvas';

export interface EffectPoint {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

interface PooledParticle {
    readonly entity: Entity;
    active: boolean;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
    grow: boolean;
}

function boxParticle(name: string, size: number): Entity {
    const entity = new PlayEntity(name);
    entity.addComponent('render', { type: 'box' });
    entity.setLocalScale(size, size, size);
    entity.enabled = false;
    return entity;
}

function sphereParticle(name: string, size: number): Entity {
    const entity = new PlayEntity(name);
    entity.addComponent('render', { type: 'sphere' });
    entity.setLocalScale(size, size, size);
    entity.enabled = false;
    return entity;
}

export class EffectPool {
    private readonly particles: PooledParticle[] = [];
    private maxActive: number;

    constructor(parent: Entity, initialSize = 24) {
        this.maxActive = initialSize;
        for (let i = 0; i < initialSize; i += 1) {
            const entity =
                i % 3 === 0 ? sphereParticle(`effect-smoke-${i}`, 0.3) : boxParticle(`effect-burst-${i}`, 0.12);
            parent.addChild(entity);
            this.particles.push({ entity, active: false, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, grow: false });
        }
    }

    setCap(maxActive: number): void {
        this.maxActive = Math.max(0, maxActive);
    }

    get activeCount(): number {
        return this.particles.filter((particle) => particle.active).length;
    }

    /** Small debris burst at a hit point. Returns particles used. */
    spawnBurst(point: EffectPoint, count = 6): number {
        return this.spawn(point, count, 0.5, false);
    }

    /** Slow grey puff that rises and grows, for smoke. */
    spawnSmoke(point: EffectPoint, count = 4): number {
        return this.spawn(point, count, 1.4, true);
    }

    /** Explosion: a fast burst plus smoke, at a death point. */
    spawnExplosion(point: EffectPoint): number {
        return this.spawnBurst(point, 10) + this.spawnSmoke({ x: point.x, y: point.y + 0.3, z: point.z }, 5);
    }

    update(dt: number): void {
        for (const particle of this.particles) {
            if (!particle.active) {
                continue;
            }
            particle.life -= dt;
            if (particle.life <= 0) {
                particle.active = false;
                particle.entity.enabled = false;
                continue;
            }
            const position = particle.entity.getPosition();
            const nextY = position.y + particle.vy * dt;
            particle.entity.setPosition(
                position.x + particle.vx * dt,
                Math.max(0.05, nextY),
                position.z + particle.vz * dt
            );
            particle.vy -= particle.grow ? -0.4 * dt : 2.5 * dt;
            const fraction = particle.life / particle.maxLife;
            const scale = particle.grow ? 0.3 + (1 - fraction) * 0.7 : 0.12 * fraction + 0.02;
            particle.entity.setLocalScale(scale, scale, scale);
        }
    }

    destroy(): void {
        for (const particle of this.particles) {
            particle.entity.destroy();
        }
        this.particles.length = 0;
    }

    private spawn(point: EffectPoint, count: number, life: number, grow: boolean): number {
        let used = 0;
        const activeNow = this.activeCount;
        const allowed = Math.max(0, this.maxActive - activeNow);
        for (const particle of this.particles) {
            if (used >= count || used >= allowed) {
                break;
            }
            if (particle.active) {
                continue;
            }
            particle.active = true;
            particle.life = life;
            particle.maxLife = life;
            particle.grow = grow;
            particle.vx = (Math.random() * 2 - 1) * (grow ? 0.5 : 3);
            particle.vy = grow ? 0.8 + Math.random() * 0.6 : 1 + Math.random() * 2.5;
            particle.vz = (Math.random() * 2 - 1) * (grow ? 0.5 : 3);
            particle.entity.setPosition(point.x, Math.max(0.1, point.y), point.z);
            particle.entity.enabled = true;
            used += 1;
        }
        return used;
    }
}
