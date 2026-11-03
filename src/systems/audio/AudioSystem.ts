import type { EventBus } from '../../core/EventBus';
import type { GameContext, GameSystem } from '../../core/GameTypes';

/**
 * Minimal Build 2 audio consumer (SRS section 7-F, Build 2 gate: weapon
 * audio events). Sounds are procedural Web Audio — no licensed audio
 * files are needed or shipped — and the first sound is created only
 * after a user gesture, because browsers block autoplay. The full mixer
 * (master / music / SFX sliders, positional emitters, pause policy)
 * is Build 4; this system only proves the weapon audio events reach a
 * listener and produce the right kind of sound.
 */
export class AudioSystem implements GameSystem {
    readonly name = 'audio';

    private context: AudioContext | null = null;
    private volume = 0.64;
    private muted = false;
    private readonly cleanups: (() => void)[] = [];

    initialize(context: GameContext): void {
        const bus: EventBus = context.eventBus;
        this.cleanups.push(
            bus.on('weapon.fired', ({ weaponId }) => this.playGunshot(weaponId)),
            bus.on('combat.hitConfirmed', () => this.playHit()),
            bus.on('weapon.reloadStarted', () => this.playReload()),
            bus.on('settings.audioChanged', (audio) => {
                this.volume = audio.master * audio.sfx;
                this.muted = audio.muted;
            })
        );
    }

    dispose(): void {
        for (const cleanup of this.cleanups.splice(0)) {
            cleanup();
        }
        void this.context?.close();
        this.context = null;
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

    private playGunshot(weaponId: string): void {
        const ctx = this.ensureContext();
        if (ctx === null) {
            return;
        }
        const duration = weaponId === 'shotgun' ? 0.25 : 0.12;
        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this.volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start();
    }

    private playHit(): void {
        const ctx = this.ensureContext();
        if (ctx === null) {
            return;
        }
        const oscillator = ctx.createOscillator();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(1400, ctx.currentTime);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this.volume * 0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.05);
    }

    private playReload(): void {
        const ctx = this.ensureContext();
        if (ctx === null) {
            return;
        }
        for (const offset of [0, 0.18]) {
            const oscillator = ctx.createOscillator();
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(700, ctx.currentTime + offset);
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(this.volume * 0.25, ctx.currentTime + offset);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.04);
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.start(ctx.currentTime + offset);
            oscillator.stop(ctx.currentTime + offset + 0.04);
        }
    }
}
