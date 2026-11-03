import type { EventBus } from '../../core/EventBus';
import type { GameContext, GameSystem, Settings } from '../../core/GameTypes';
import type { SaveRepository } from '../../services/SaveRepository';

import { ArenaStats } from './arenaStats';

/**
 * Build 0 menu / loading / error shell (SRS sections 2, 4.2, 7-E),
 * extended in Build 4 with the arena HUD objective, damage flash and
 * results shell (SRS section 7-E, Build 4 gate). Campaign missions
 * still arrive in Build 5: the Campaign button shows the loading
 * shell honestly instead of faking a mission, and the results shell
 * covers the test arena only — its enemy total (3) is the test-arena
 * constant, replaced by mission data in Build 5.
 */
export class UISystem implements GameSystem {
    readonly name = 'ui';

    private eventBus: EventBus | null = null;
    private save: SaveRepository | null = null;
    private readonly cleanups: (() => void)[] = [];
    private readonly stats = new ArenaStats();
    private resultsShown = false;
    private flashTimer: number | null = null;

    initialize(context: GameContext): void {
        this.eventBus = context.eventBus;
        this.save = context.services.get<SaveRepository>('save');
        this.bind();
        this.subscribeArena();
        void this.loadSettings();
    }

    private nowSeconds(): number {
        return performance.now() / 1000;
    }

    private setObjective(remaining: number): void {
        const element = document.getElementById('hud-objective-text');
        if (element === null) {
            return;
        }
        element.textContent = remaining > 0 ? `Eliminate all 3 enemies — ${remaining} remaining` : 'Arena cleared!';
    }

    private hideResults(): void {
        const overlay = document.getElementById('results-overlay');
        if (overlay !== null) {
            overlay.hidden = true;
        }
    }

    private resetArena(): void {
        this.stats.reset(this.nowSeconds());
        this.resultsShown = false;
        this.hideResults();
        this.setObjective(3);
    }

    private subscribeArena(): void {
        if (this.eventBus === null) {
            return;
        }
        this.cleanups.push(
            this.eventBus.on('app.stateChanged', ({ previousState, newState }) => {
                if (newState === 'playing' && previousState === 'loading') {
                    this.resetArena();
                }
                if (newState === 'mainMenu') {
                    this.hideResults();
                }
            }),
            this.eventBus.on('arena.restarted', () => this.resetArena()),
            this.eventBus.on('weapon.fired', ({ ownerId }) => {
                if (ownerId === 'player') {
                    this.stats.onShot();
                }
            }),
            this.eventBus.on('combat.hitConfirmed', ({ sourceId }) => {
                if (sourceId === 'player') {
                    this.stats.onHit();
                }
            }),
            this.eventBus.on('entity.died', ({ entityType }) => {
                if (entityType !== 'enemy' || this.resultsShown) {
                    return;
                }
                this.stats.onKill();
                const summary = this.stats.summary(this.nowSeconds(), 3);
                this.setObjective(3 - summary.kills);
                if (!summary.cleared) {
                    return;
                }
                this.resultsShown = true;
                this.stats.stop(this.nowSeconds());
                const finalSummary = this.stats.summary(this.nowSeconds(), 3);
                const text = document.getElementById('results-text');
                if (text !== null) {
                    text.textContent =
                        `Kills ${finalSummary.kills} · Shots ${finalSummary.shots} · ` +
                        `Hits ${finalSummary.hits} · Accuracy ${finalSummary.accuracy}% · ` +
                        `Time ${finalSummary.timeSeconds}s`;
                }
                const overlay = document.getElementById('results-overlay');
                if (overlay !== null) {
                    overlay.hidden = false;
                }
                this.eventBus?.emit('arena.cleared', {
                    kills: finalSummary.kills,
                    shots: finalSummary.shots,
                    hits: finalSummary.hits,
                    timeSeconds: finalSummary.timeSeconds
                });
            }),
            this.eventBus.on('player.healthChanged', ({ delta }) => {
                if (delta >= 0) {
                    return;
                }
                const flash = document.getElementById('hud-damage-flash');
                if (flash === null) {
                    return;
                }
                flash.style.opacity = '0.55';
                if (this.flashTimer !== null) {
                    window.clearTimeout(this.flashTimer);
                }
                // Hold for 2 s so the flash is readable even when the
                // HUD itself updates slowly (low frame rate stretches
                // the time between damage and the next HUD refresh).
                this.flashTimer = window.setTimeout(() => {
                    flash.style.opacity = '0';
                    this.flashTimer = null;
                }, 2000);
            })
        );
    }

    private bind(): void {
        const $ = (id: string): HTMLElement | null => document.getElementById(id);
        const status = $('app-status');
        const menu = $('main-menu');
        const loading = $('loading-overlay');
        const errorOverlay = $('error-overlay');

        const showPanel = (id: string): void => {
            for (const panel of document.querySelectorAll<HTMLElement>('.panel-view')) {
                panel.hidden = panel.id !== id;
            }
        };
        const showMenu = (): void => {
            showPanel('panel-home');
        };

        const on = (element: HTMLElement | null, type: string, handler: () => void): void => {
            if (element === null) {
                return;
            }
            element.addEventListener(type, handler);
            this.cleanups.push(() => element.removeEventListener(type, handler));
        };

        on($('btn-settings'), 'click', () => showPanel('panel-settings'));
        on($('btn-controls'), 'click', () => showPanel('panel-controls'));
        on($('btn-credits'), 'click', () => showPanel('panel-credits'));
        for (const button of document.querySelectorAll<HTMLElement>('[data-back-to-menu]')) {
            on(button, 'click', showMenu);
        }

        on($('btn-campaign'), 'click', () => {
            if (menu !== null) menu.hidden = true;
            if (loading !== null) loading.hidden = false;
            if (status !== null) {
                status.textContent = 'Build 0 shell: no mission bundle is loaded yet. Missions arrive in Build 5.';
            }
        });
        on($('btn-loading-back'), 'click', () => {
            if (loading !== null) loading.hidden = true;
            if (menu !== null) menu.hidden = false;
        });
        on($('btn-error-menu'), 'click', () => {
            if (errorOverlay !== null) errorOverlay.hidden = true;
            if (menu !== null) menu.hidden = false;
        });

        const settingsChanged = (): void => {
            void this.persistSettings();
        };
        for (const id of [
            'setting-master',
            'setting-music',
            'setting-sfx',
            'setting-muted',
            'setting-sensitivity',
            'setting-quality'
        ]) {
            const element = $(id);
            if (element !== null) {
                element.addEventListener('input', settingsChanged);
                element.addEventListener('change', settingsChanged);
                this.cleanups.push(() => {
                    element.removeEventListener('input', settingsChanged);
                    element.removeEventListener('change', settingsChanged);
                });
            }
        }

        const unsubscribeState = this.eventBus?.on('app.stateChanged', ({ newState }) => {
            if (status !== null) {
                status.textContent = `State: ${newState}`;
            }
        });
        if (unsubscribeState !== undefined) {
            this.cleanups.push(unsubscribeState);
        }
        const unsubscribeError = this.eventBus?.on('app.error', ({ message }) => {
            const messageElement = $('error-message');
            if (messageElement !== null) {
                messageElement.textContent = message;
            }
            if (errorOverlay !== null) errorOverlay.hidden = false;
        });
        if (unsubscribeError !== undefined) {
            this.cleanups.push(unsubscribeError);
        }
    }

    private async loadSettings(): Promise<void> {
        if (this.save === null) {
            return;
        }
        const data = await this.save.load();
        this.applySettings(data.settings);
        const continueButton = document.getElementById('btn-continue') as HTMLButtonElement | null;
        if (continueButton !== null) {
            continueButton.disabled = data.unlockedLevel <= 1;
            continueButton.title =
                data.unlockedLevel <= 1 ? 'No saved progress yet' : `Continue from mission ${data.unlockedLevel}`;
        }
    }

    private applySettings(settings: Settings): void {
        const set = (id: string, value: string): void => {
            const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
            if (element !== null) {
                element.value = value;
            }
        };
        set('setting-master', String(settings.audio.master));
        set('setting-music', String(settings.audio.music));
        set('setting-sfx', String(settings.audio.sfx));
        set('setting-quality', settings.quality);
        set('setting-sensitivity', String(settings.sensitivity));
        const muted = document.getElementById('setting-muted') as HTMLInputElement | null;
        if (muted !== null) {
            muted.checked = settings.audio.muted;
        }
    }

    private async persistSettings(): Promise<void> {
        if (this.save === null || this.eventBus === null) {
            return;
        }
        const read = (id: string, fallback: number): number => {
            const element = document.getElementById(id) as HTMLInputElement | null;
            const parsed = element === null ? Number.NaN : Number.parseFloat(element.value);
            return Number.isFinite(parsed) ? parsed : fallback;
        };
        const muted = document.getElementById('setting-muted') as HTMLInputElement | null;
        const quality = document.getElementById('setting-quality') as HTMLSelectElement | null;
        const settings: Settings = {
            audio: {
                master: read('setting-master', 0.8),
                music: read('setting-music', 0.6),
                sfx: read('setting-sfx', 0.8),
                muted: muted?.checked ?? false
            },
            sensitivity: read('setting-sensitivity', 1),
            quality: quality?.value === 'low' || quality?.value === 'high' ? quality.value : 'medium'
        };
        await this.save.updateSettings(settings);
        this.eventBus.emit('settings.audioChanged', settings.audio);
        this.eventBus.emit('settings.changed', settings);
    }

    dispose(): void {
        for (const cleanup of this.cleanups.splice(0)) {
            cleanup();
        }
        this.eventBus = null;
        this.save = null;
    }
}
