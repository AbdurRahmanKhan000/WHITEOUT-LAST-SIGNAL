import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameTypes';

/**
 * Runtime state machine (SRS section 4.2).
 * Only the transitions in the SRS table are legal. An illegal transition is
 * rejected (returns false) instead of silently corrupting the game state.
 * Settings is an overlay on MainMenu/Paused, not a separate state.
 */
const ALLOWED: Record<GameState, readonly GameState[]> = {
    boot: ['mainMenu', 'error'],
    mainMenu: ['loading', 'error'],
    loading: ['briefing', 'playing', 'mainMenu', 'error'],
    briefing: ['playing', 'mainMenu'],
    playing: ['paused', 'victory', 'defeat', 'error'],
    paused: ['playing', 'mainMenu'],
    victory: ['mainMenu', 'loading'],
    defeat: ['mainMenu', 'loading'],
    error: ['mainMenu', 'boot']
};

export class GameStateMachine {
    private state: GameState = 'boot';
    private readonly eventBus: EventBus;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
    }

    get current(): GameState {
        return this.state;
    }

    canTransitionTo(next: GameState): boolean {
        return ALLOWED[this.state].includes(next);
    }

    transitionTo(next: GameState): boolean {
        if (!this.canTransitionTo(next)) {
            return false;
        }
        const previous = this.state;
        this.state = next;
        this.eventBus.emit('app.stateChanged', { previousState: previous, newState: next });
        return true;
    }
}
