/**
 * Build 4 — Graphics & Effects system (SRS section 6-C, FR-13/FR-14).
 * Owns the pooled effects and the quality presets. Combat feedback
 * that already lives in PlayerSystem (muzzle flash, tracer, the single
 * impact sphere) stays there — this system adds the pooled layer on
 * top of it: debris bursts on every confirmed hit, smoke and an
 * explosion on every enemy death, and real preset changes (device
 * pixel ratio, light shadows, effect budget) when the settings
 * quality changes. It never touches player or enemy internals; it
 * only reads event payloads and the scene's light entity.
 */
import type { AppBase, Entity, LightComponent } from 'playcanvas';

import type { GameStateMachine } from '../../app/GameStateMachine';
import type { GameContext, GameSystem, QualityPreset } from '../../core/GameTypes';

import { EffectPool } from './EffectPool';
import { qualityProfile } from './quality';

export class GraphicsSystem implements GameSystem {
    readonly name = 'graphics';

    private app: AppBase | null = null;
    private stateMachine: GameStateMachine | null = null;
    private pool: EffectPool | null = null;
    private readonly cleanups: (() => void)[] = [];
    private currentPreset: QualityPreset = 'medium';

    initialize(context: GameContext): void {
        this.stateMachine = context.services.get<GameStateMachine>('stateMachine');
        this.app = context.services.get<AppBase>('app');
        this.pool = new EffectPool(this.app.root);
        this.cleanups.push(
            context.eventBus.on('combat.hitConfirmed', ({ worldPosition }) => {
                this.pool?.spawnBurst({ x: worldPosition[0], y: worldPosition[1], z: worldPosition[2] });
            }),
            context.eventBus.on('entity.died', ({ entityType, position }) => {
                if (entityType === 'enemy') {
                    this.pool?.spawnExplosion({ x: position[0], y: position[1] + 0.5, z: position[2] });
                    this.pool?.spawnSmoke({ x: position[0], y: position[1] + 0.4, z: position[2] });
                }
            }),
            context.eventBus.on('settings.changed', ({ quality }) => {
                this.applyPreset(quality);
            })
        );
    }

    update(dt: number): void {
        if (this.stateMachine?.current !== 'playing') {
            return;
        }
        this.pool?.update(dt);
    }

    dispose(): void {
        for (const cleanup of this.cleanups.splice(0)) {
            cleanup();
        }
        this.pool?.destroy();
        this.pool = null;
        this.app = null;
        this.stateMachine = null;
    }

    /** Apply a preset to the live renderer and the effect budget. */
    applyPreset(preset: QualityPreset): void {
        this.currentPreset = preset;
        const profile = qualityProfile(preset);
        this.pool?.setCap(profile.maxEffects);
        if (this.app !== null) {
            const device = this.app.graphicsDevice;
            if (device !== undefined && device !== null) {
                device.maxPixelRatio = Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap);
            }
            const lightEntity = this.app.root.findByName('light') as unknown as Entity | null;
            const lightComponent = lightEntity?.findComponent('light') as LightComponent | null;
            if (lightComponent !== null && lightComponent !== undefined) {
                lightComponent.castShadows = profile.castShadows;
                lightComponent.shadowResolution = profile.shadowResolution;
            }
        }
    }

    get preset(): QualityPreset {
        return this.currentPreset;
    }
}
