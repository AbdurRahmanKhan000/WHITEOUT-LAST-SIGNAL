/**
 * Build 4 — graphics quality profiles (SRS FR-14, Build 4 gate).
 * Pure mapping, so the presets are unit-testable: a preset is not just
 * a label in a dropdown, it changes the real runtime settings in
 * GraphicsSystem (device pixel ratio, shadow casting, effect budget).
 */
import type { QualityPreset } from '../../core/GameTypes';

export interface QualityProfile {
    readonly preset: QualityPreset;
    /** Cap applied as min(devicePixelRatio, pixelRatioCap). */
    readonly pixelRatioCap: number;
    readonly castShadows: boolean;
    readonly shadowResolution: number;
    /** Maximum simultaneous pooled effect particles. */
    readonly maxEffects: number;
}

export function qualityProfile(preset: QualityPreset): QualityProfile {
    switch (preset) {
        case 'low':
            return { preset, pixelRatioCap: 1, castShadows: false, shadowResolution: 512, maxEffects: 12 };
        case 'high':
            return { preset, pixelRatioCap: 2, castShadows: true, shadowResolution: 2048, maxEffects: 48 };
        case 'medium':
        default:
            return { preset, pixelRatioCap: 1.5, castShadows: true, shadowResolution: 1024, maxEffects: 24 };
    }
}
