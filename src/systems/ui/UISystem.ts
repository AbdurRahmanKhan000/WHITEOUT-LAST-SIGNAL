import type { EventBus } from '../../core/EventBus';
import type { GameContext, GameSystem, SaveData, Settings } from '../../core/GameTypes';
import type { SaveRepository } from '../../services/SaveRepository';
import { catalogByStage, findLevel } from '../mission/MissionCatalog';

import { ArenaStats } from './arenaStats';

/**
 * Build 0 menu / loading / error shell (SRS sections 2, 4.2, 7-E),
 * extended in Build 4 with the arena HUD objective, damage flash and
 * results shell (SRS section 7-E, Build 4 gate), and in Build 5 with
 * the campaign list, briefing, mission victory/defeat screens and the
 * modern-shooter UI polish (see starter.css). The arena results shell
 * covers the test arena only; mission results are the separate
 * mission victory/defeat overlays. Briefing is a menu panel, not a
 * runtime state — the state machine's briefing state is unused, the
 * same way Settings is an overlay rather than a state.
 */
export class UISystem implements GameSystem {
    readonly name = 'ui';

    private eventBus: EventBus | null = null;
    private save: SaveRepository | null = null;
    private readonly cleanups: (() => void)[] = [];
    private readonly stats = new ArenaStats();
    private resultsShown = false;
    private flashTimer: number | null = null;
    private missionActive = false;
    private currentMissionId = 0;
    private currentMissionNext: number | null = null;
    private pendingBriefingLevel = 0;
    private lastSave: SaveData | null = null;

    initialize(context: GameContext): void {
        this.eventBus = context.eventBus;
        this.save = context.services.get<SaveRepository>('save');
        this.bind();
        this.subscribeArena();
        this.subscribeMission();
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
                // Build 5: mission transitions go through loading too,
                // but the arena stats/objective must not overwrite the
                // mission objective when a mission starts.
                if (newState === 'playing' && previousState === 'loading' && !this.missionActive) {
                    this.resetArena();
                }
                if (newState === 'mainMenu') {
                    this.missionActive = false;
                    this.hideResults();
                    this.hideMissionOverlays();
                }
            }),
            this.eventBus.on('arena.restarted', () => {
                if (!this.missionActive) {
                    this.resetArena();
                }
            }),
            this.eventBus.on('weapon.fired', ({ ownerId }) => {
                if (ownerId === 'player' && !this.missionActive) {
                    this.stats.onShot();
                }
            }),
            this.eventBus.on('combat.hitConfirmed', ({ sourceId }) => {
                if (sourceId === 'player' && !this.missionActive) {
                    this.stats.onHit();
                }
            }),
            this.eventBus.on('entity.died', ({ entityType }) => {
                if (entityType !== 'enemy' || this.resultsShown || this.missionActive) {
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

    private hideMissionOverlays(): void {
        for (const id of ['mission-victory-overlay', 'mission-defeat-overlay']) {
            const overlay = document.getElementById(id);
            if (overlay !== null) {
                overlay.hidden = true;
            }
        }
    }

    private setMissionObjective(label: string): void {
        const element = document.getElementById('hud-objective-text');
        if (element !== null) {
            element.textContent = label;
        }
    }

    private subscribeMission(): void {
        if (this.eventBus === null) {
            return;
        }
        this.cleanups.push(
            this.eventBus.on('mission.started', ({ levelId, objectiveLabel }) => {
                this.missionActive = true;
                this.currentMissionId = levelId;
                this.hideMissionOverlays();
                this.hideResults();
                this.setMissionObjective(objectiveLabel);
            }),
            this.eventBus.on('mission.objectiveChanged', ({ label }) => {
                if (this.missionActive) {
                    this.setMissionObjective(label);
                }
            }),
            this.eventBus.on('mission.retryCheckpoint', () => {
                const overlay = document.getElementById('mission-defeat-overlay');
                if (overlay !== null) {
                    overlay.hidden = true;
                }
            }),
            this.eventBus.on('mission.completed', (result) => {
                this.currentMissionNext = result.nextLevelId;
                const level = findLevel(result.levelId);
                // Build 7 ending: Level 30 is the last mission, so its
                // victory screen is also the campaign ending. No
                // cinematic cutscene is claimed — the ending is this
                // results screen plus the campaign-complete message,
                // and the campaign list shows the same state on reload.
                const campaignComplete = result.levelId === 30;
                const text = document.getElementById('mission-result-text');
                if (text !== null) {
                    text.textContent =
                        `${level?.name ?? `Level ${result.levelId}`} complete · ` +
                        `Kills ${result.kills} · Accuracy ${result.accuracy}% · ` +
                        `Time ${result.timeSeconds}s · Damage ${result.damageReceived} · ` +
                        `Score ${result.score} · Rank ${result.rank}` +
                        (campaignComplete
                            ? ' · Campaign complete! You finished all 30 missions of WHITEOUT: Last Signal.'
                            : '');
                }
                const nextButton = document.getElementById('btn-mission-next') as HTMLButtonElement | null;
                if (nextButton !== null) {
                    const hasNext = result.nextLevelId !== null && findLevel(result.nextLevelId) !== null;
                    nextButton.disabled = !hasNext;
                    nextButton.textContent = hasNext
                        ? `Next mission: Level ${result.nextLevelId}`
                        : 'Campaign complete — no next mission';
                }
                const overlay = document.getElementById('mission-victory-overlay');
                if (overlay !== null) {
                    overlay.hidden = false;
                }
            }),
            this.eventBus.on('mission.defeated', ({ levelId }) => {
                const level = findLevel(levelId);
                const text = document.getElementById('mission-defeat-text');
                if (text !== null) {
                    text.textContent = `${level?.name ?? `Level ${levelId}`} — mission failed. Retry from your last checkpoint, restart the mission, or return to the menu.`;
                }
                const overlay = document.getElementById('mission-defeat-overlay');
                if (overlay !== null) {
                    overlay.hidden = false;
                }
            })
        );
    }

    /** Campaign list as stage-grouped level cards (Build 5 UI polish). */
    private renderCampaign(save: SaveData): void {
        const list = document.getElementById('campaign-list');
        if (list === null) {
            return;
        }
        list.innerHTML = '';
        // Build 7: frontier 31 means Level 30 is complete, so the
        // campaign is complete. The banner is the menu-side ending
        // state; it survives a reload because the frontier is saved.
        if (save.unlockedLevel >= 31) {
            const banner = document.createElement('p');
            banner.className = 'campaign-complete-banner';
            banner.textContent = 'Campaign complete — all 30 missions finished. Replay any mission from its card.';
            list.appendChild(banner);
        }
        for (const { stage, entries } of catalogByStage()) {
            const heading = document.createElement('h3');
            heading.className = 'campaign-stage';
            heading.textContent = stage;
            list.appendChild(heading);
            const grid = document.createElement('div');
            grid.className = 'campaign-grid';
            for (const entry of entries) {
                const card = document.createElement('article');
                const unlocked = entry.playable && entry.id <= save.unlockedLevel;
                const best = save.bestResults[String(entry.id)];
                card.className = `level-card${unlocked ? '' : ' locked'}`;
                const title = document.createElement('h4');
                title.textContent = `${entry.id}. ${entry.name}`;
                card.appendChild(title);
                const meta = document.createElement('p');
                meta.className = 'level-meta';
                meta.textContent = entry.environment;
                card.appendChild(meta);
                if (entry.difficulty !== undefined) {
                    const badge = document.createElement('span');
                    badge.className = `difficulty-badge difficulty-${entry.difficulty.toLowerCase().replace(' ', '-')}`;
                    badge.textContent = entry.difficulty;
                    card.appendChild(badge);
                }
                const objective = document.createElement('p');
                objective.className = 'level-objective';
                objective.textContent = entry.objectiveSummary;
                card.appendChild(objective);
                if (best !== undefined) {
                    const bestLine = document.createElement('p');
                    bestLine.className = 'best-result';
                    bestLine.textContent = `Best: score ${best.score} · ${best.kills} kills · ${best.accuracy}% accuracy`;
                    card.appendChild(bestLine);
                }
                const action = document.createElement('button');
                action.type = 'button';
                if (!entry.playable) {
                    action.disabled = true;
                    action.textContent = `Coming in ${entry.comingIn ?? 'a later build'}`;
                } else if (unlocked) {
                    action.textContent = 'Play';
                    action.addEventListener('click', () => this.showBriefing(entry.id));
                } else {
                    action.disabled = true;
                    action.textContent = `Locked — complete level ${save.unlockedLevel} first`;
                }
                card.appendChild(action);
                grid.appendChild(card);
            }
            list.appendChild(grid);
        }
    }

    private showBriefing(levelId: number): void {
        const level = findLevel(levelId);
        if (level === null) {
            return;
        }
        this.pendingBriefingLevel = levelId;
        const set = (id: string, value: string): void => {
            const element = document.getElementById(id);
            if (element !== null) {
                element.textContent = value;
            }
        };
        set('briefing-title', `${level.id}. ${level.name}`);
        set('briefing-environment', `${level.environment} · ${level.stage} · ${level.difficulty}`);
        const objectives = document.getElementById('briefing-objectives');
        if (objectives !== null) {
            objectives.innerHTML = '';
            for (const objective of level.objectives) {
                const item = document.createElement('li');
                item.textContent = objective.label;
                objectives.appendChild(item);
            }
        }
        const enemyCount = level.enemySpawnGroups.reduce((total, group) => total + group.spawns.length, 0);
        set(
            'briefing-threat',
            `${enemyCount} enemies in ${level.enemySpawnGroups.length} group${level.enemySpawnGroups.length === 1 ? '' : 's'}` +
                `${level.rifleReserve !== undefined ? ` · Rifle reserve ${level.rifleReserve}` : ''}`
        );
        for (const panel of document.querySelectorAll<HTMLElement>('.panel-view')) {
            panel.hidden = panel.id !== 'panel-briefing';
        }
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
            void (async () => {
                if (this.save !== null) {
                    this.lastSave = await this.save.load();
                    this.renderCampaign(this.lastSave);
                }
                showPanel('panel-campaign');
            })();
        });
        on($('btn-continue'), 'click', () => {
            const unlocked = this.lastSave?.unlockedLevel ?? 1;
            // Build 6: Continue follows the playable catalog, not a
            // hard-coded Build 5 cap — an unlocked-but-unbuilt level
            // (e.g. 21 after completing 20) lands on the campaign
            // list instead of a broken briefing.
            if (findLevel(unlocked) !== null) {
                this.showBriefing(unlocked);
            } else {
                showPanel('panel-campaign');
            }
        });
        on($('btn-briefing-deploy'), 'click', () => {
            if (this.pendingBriefingLevel > 0) {
                this.eventBus?.emit('mission.requested', { levelId: this.pendingBriefingLevel });
            }
        });
        on($('btn-mission-next'), 'click', () => {
            if (this.currentMissionNext !== null && findLevel(this.currentMissionNext) !== null) {
                this.eventBus?.emit('mission.requested', { levelId: this.currentMissionNext });
            }
        });
        on($('btn-mission-retry'), 'click', () => {
            if (this.currentMissionId > 0) {
                this.eventBus?.emit('mission.requested', { levelId: this.currentMissionId });
            }
        });
        on($('btn-mission-victory-menu'), 'click', () => {
            this.eventBus?.emit('mission.exitRequested', {});
        });
        on($('btn-mission-retry-checkpoint'), 'click', () => {
            this.eventBus?.emit('mission.retryCheckpointRequested', {});
        });
        on($('btn-mission-restart'), 'click', () => {
            if (this.currentMissionId > 0) {
                this.eventBus?.emit('mission.requested', { levelId: this.currentMissionId });
            }
        });
        on($('btn-mission-defeat-menu'), 'click', () => {
            this.eventBus?.emit('mission.exitRequested', {});
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
        this.lastSave = data;
        this.applySettings(data.settings);
        this.renderCampaign(data);
        const continueButton = document.getElementById('btn-continue') as HTMLButtonElement | null;
        if (continueButton !== null) {
            // Frontier 31 is not a mission: there is nothing to
            // continue to, so Continue is disabled with the ending
            // title instead of pointing at a nonexistent mission 31.
            // Completed missions are still replayable from the
            // campaign list.
            continueButton.disabled = data.unlockedLevel <= 1 || data.unlockedLevel >= 31;
            continueButton.title =
                data.unlockedLevel <= 1
                    ? 'No saved progress yet'
                    : data.unlockedLevel >= 31
                      ? 'Campaign complete — all 30 missions finished'
                      : `Continue from mission ${data.unlockedLevel}`;
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
