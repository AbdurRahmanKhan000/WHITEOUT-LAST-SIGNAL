import type { GameEventMap, GameEventName } from './GameTypes';

/**
 * Typed publish/subscribe bus (SRS section 5).
 * Handlers receive a frozen snapshot of the payload. Subscriptions are
 * removed explicitly or all at once on dispose, so a level unload can never
 * leave an orphaned listener behind (FR-25).
 */
export class EventBus {
    private readonly handlers = new Map<GameEventName, Set<(payload: never) => void>>();

    on<K extends GameEventName>(event: K, handler: (payload: GameEventMap[K]) => void): () => void {
        let set = this.handlers.get(event);
        if (set === undefined) {
            set = new Set();
            this.handlers.set(event, set);
        }
        const stored = handler as (payload: never) => void;
        set.add(stored);
        return () => {
            set.delete(stored);
            if (set.size === 0) {
                this.handlers.delete(event);
            }
        };
    }

    once<K extends GameEventName>(event: K, handler: (payload: GameEventMap[K]) => void): () => void {
        const unsubscribe = this.on(event, (payload) => {
            unsubscribe();
            handler(payload);
        });
        return unsubscribe;
    }

    emit<K extends GameEventName>(event: K, payload: GameEventMap[K]): void {
        const set = this.handlers.get(event);
        if (set === undefined) {
            return;
        }
        // Copy before iterating so a handler that unsubscribes cannot
        // corrupt delivery to the remaining handlers.
        const snapshot = Object.freeze(payload);
        for (const handler of [...set]) {
            handler(snapshot as never);
        }
    }

    listenerCount<K extends GameEventName>(event: K): number {
        return this.handlers.get(event)?.size ?? 0;
    }

    dispose(): void {
        this.handlers.clear();
    }
}
