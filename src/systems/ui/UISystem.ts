import type { EventBus } from '../../core/EventBus';
import type { GameContext, GameSystem, Settings } from '../../core/GameTypes';
import type { SaveRepository } from '../../services/SaveRepository';

/**
 * Build 0 menu / loading / error shell (SRS sections 2, 4.2, 7-E).
 * This is the shell only: campaign missions, HUD gameplay and results
 * arrive in Builds 4-5. Buttons that would start a mission therefore show
 * the loading shell honestly and return to the menu, instead of faking a
 * mission that does not exist yet.
 */
export class UISystem implements GameSystem {
    readonly name = 'ui';

    private eventBus: EventBus | null = null;
    private save: SaveRepository | null = null;
    private readonly cleanups: (() => void)[] = [];

    initialize(context: GameContext): void {
        this.eventBus = context.eventBus;
        this.save = context.services.get<SaveRepository>('save');
        this.bind();
        void this.loadSettings();
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
    }

    dispose(): void {
        for (const cleanup of this.cleanups.splice(0)) {
            cleanup();
        }
        this.eventBus = null;
        this.save = null;
    }
}
