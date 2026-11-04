/**
 * Build 4 audio system (SRS section 7-F, FR-23, Build 4 gate).
 * Procedural Web Audio only — no licensed audio files are shipped.
 * The mixer follows the settings sliders (master / music / SFX /
 * mute) live; gunfire, hits and explosions are positional, attenuated
 * by distance from the camera and panned by world X offset (see
 * positional.ts for the documented limitation). The first sound is
 * created only after a user gesture, because browsers block autoplay:
 * the ambient loop starts when play begins, which always follows the
 * arena button click. The full positional model (head-relative pan,
 * occlusion, reverb) is Build 8 polish, not claimed here.
 */
import type { AppBase } from 'playcanvas';

import type { GameContext, GameSystem, Vec3Tuple } from '../../core/GameTypes';

import { positionalGain } from './positional';

export class AudioSystem implements GameSystem {
    readonly name = 'audio';

    private context: AudioContext | null = null;
    private app: AppBase | null = null;
    private volume = 0.64;
    private musicVolume = 0.6;
    private muted = false;
    private ambientSource: AudioBufferSourceNode | null = null;
    private ambientGain: GainNode | null = null;
    private readonly cleanups: (() => void)[] = [];

    initialize(context: GameContext): void {
        try {
            this.app = context.services.get<AppBase>('app');
        } catch {
            this.app = null;
        }
        const bus = context.eventBus;
        this.cleanups.push(
            bus.on('weapon.fired', ({ ownerId, weaponId, origin }) => this.playGunshot(weaponId, ownerId, origin)),
            bus.on('combat.hitConfirmed', ({ targetId, worldPosition }) => this.playHit(targetId, worldPosition)),
            bus.on('weapon.reloadStarted', () => this.playReload()),
            bus.on('entity.died', ({ entityType, position }) => {
                if (entityType === 'enemy') {
                    this.playExplosion(position);
                }
            }),
            bus.on('enemy.detected', () => this.playAlert()),
            bus.on('arena.cleared', () => this.playVictory()),
            bus.on('mission.completed', () => this.playVictory()),
            bus.on('mission.defeated', () => this.playDefeat()),
            bus.on('app.stateChanged', ({ newState }) => {
                if (newState === 'playing') {
                    this.startAmbient();
                } else if (newState === 'paused' || newState === 'mainMenu') {
                    void this.context?.suspend();
                }
            }),
            bus.on('settings.audioChanged', (audio) => {
                this.volume = audio.master * audio.sfx;
                this.musicVolume = audio.master * audio.music;
                this.muted = audio.muted;
                if (this.ambientGain !== null && this.context !== null) {
                    this.ambientGain.gain.setValueAtTime(
                        this.muted ? 0 : this.musicVolume * 0.12,
                        this.context.currentTime
                    );
                }
            })
        );
    }

    dispose(): void {
        for (const cleanup of this.cleanups.splice(0)) {
            cleanup();
        }
        try {
            this.ambientSource?.stop();
        } catch {
            // Already stopped; nothing to clean up.
        }
        this.ambientSource = null;
        this.ambientGain = null;
        void this.context?.close();
        this.context = null;
        this.app = null;
    }

    private ensureContext(): AudioContext | null {
        if (this.muted) {
            return null;
        }
        try {
            if (this.context === null) {
                const Constructor = window.AudioContext;
                this.context = new Constructor();
            }
            if (this.context.state === 'suspended') {
                void this.context.resume();
            }
            return this.context;
        } catch {
            return null;
        }
    }

    private cameraPosition(): Vec3Tuple | null {
        if (this.app === null) {
            return null;
        }
        const camera = this.app.root.findByName('camera');
        if (camera === null) {
            return null;
        }
        const position = camera.getPosition();
        return [position.x, position.y, position.z];
    }

    private noise(ctx: AudioContext, duration: number, volume: number, pan: number, lowpassHz?: number): void {
        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        let node: AudioNode = gain;
        if (lowpassHz !== undefined) {
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(lowpassHz, ctx.currentTime);
            gain.connect(filter);
            node = filter;
        }
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, ctx.currentTime);
        node.connect(panner);
        source.connect(gain);
        panner.connect(ctx.destination);
        source.start();
    }

    private tone(
        ctx: AudioContext,
        frequency: number,
        duration: number,
        volume: number,
        type: OscillatorType = 'square',
        delay = 0
    ): void {
        const oscillator = ctx.createOscillator();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + delay);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(ctx.currentTime + delay);
        oscillator.stop(ctx.currentTime + delay + duration);
    }

    private playGunshot(weaponId: string, ownerId: string, origin: Vec3Tuple): void {
        const ctx = this.ensureContext();
        if (ctx === null) {
            return;
        }
        const duration = weaponId === 'shotgun' ? 0.25 : 0.12;
        if (ownerId === 'player') {
            this.noise(ctx, duration, this.volume, 0);
            return;
        }
        const listener = this.cameraPosition();
        if (listener === null) {
            this.noise(ctx, duration, this.volume, 0);
            return;
        }
        const gain = positionalGain(origin, listener);
        this.noise(ctx, duration, this.volume * gain.volume, gain.pan);
    }

    private playHit(targetId: string, worldPosition: Vec3Tuple): void {
        const ctx = this.ensureContext();
        if (ctx === null) {
            return;
        }
        if (targetId === 'player') {
            // Hurt thud for the player's own damage, full volume: the
            // listener is the player, so no positional attenuation.
            this.tone(ctx, 120, 0.15, this.volume * 0.6, 'sine');
            return;
        }
        const listener = this.cameraPosition();
        if (listener === null) {
            this.tone(ctx, 1400, 0.05, this.volume * 0.3);
            return;
        }
        const gain = positionalGain(worldPosition, listener);
        this.tone(ctx, 1400, 0.05, this.volume * 0.3 * gain.volume);
    }

    private playExplosion(position: Vec3Tuple): void {
        const ctx = this.ensureContext();
        if (ctx === null) {
            return;
        }
        const listener = this.cameraPosition();
        if (listener === null) {
            this.noise(ctx, 0.5, this.volume, 0, 300);
            return;
        }
        const gain = positionalGain(position, listener);
        this.noise(ctx, 0.5, this.volume * gain.volume, gain.pan, 300);
    }

    private playAlert(): void {
        const ctx = this.ensureContext();
        if (ctx === null) {
            return;
        }
        this.tone(ctx, 880, 0.09, this.volume * 0.35);
        this.tone(ctx, 660, 0.09, this.volume * 0.35, 'square', 0.12);
    }

    private playDefeat(): void {
        const ctx = this.ensureContext();
        if (ctx === null) {
            return;
        }
        for (const [index, frequency] of [440, 330, 220].entries()) {
            this.tone(ctx, frequency, 0.22, this.volume * 0.35, 'triangle', index * 0.16);
        }
    }

    private playVictory(): void {
        const ctx = this.ensureContext();
        if (ctx === null) {
            return;
        }
        for (const [index, frequency] of [523, 659, 784, 1046].entries()) {
            this.tone(ctx, frequency, 0.18, this.volume * 0.4, 'triangle', index * 0.13);
        }
    }

    private playReload(): void {
        const ctx = this.ensureContext();
        if (ctx === null) {
            return;
        }
        for (const offset of [0, 0.18]) {
            this.tone(ctx, 700, 0.04, this.volume * 0.25, 'square', offset);
        }
    }

    private startAmbient(): void {
        const ctx = this.ensureContext();
        if (ctx === null || this.ambientSource !== null) {
            return;
        }
        try {
            const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i += 1) {
                data[i] = (Math.random() * 2 - 1) * 0.4;
            }
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(300, ctx.currentTime);
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(this.muted ? 0 : this.musicVolume * 0.12, ctx.currentTime);
            source.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            source.start();
            this.ambientSource = source;
            this.ambientGain = gain;
        } catch {
            this.ambientSource = null;
            this.ambientGain = null;
        }
    }
}
