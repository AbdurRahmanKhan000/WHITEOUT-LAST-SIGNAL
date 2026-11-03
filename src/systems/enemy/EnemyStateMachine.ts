/**
 * Explicit enemy FSM (SRS section 6-B, Build 3 gate).
 * Every transition the brain can make goes through this one function, so
 * the state rules are testable without PlayCanvas and cannot drift
 * between the brain and the tests. An event that has no transition from
 * the current state leaves the state unchanged — except a lethal hit,
 * which always reaches Dead, and Dead itself, which is terminal.
 */

export type EnemyState =
    'idle' | 'patrol' | 'investigate' | 'alert' | 'chase' | 'attack' | 'takeCover' | 'stunned' | 'dead';

export type EnemyStateEvent =
    | { readonly type: 'beginPatrol' }
    | { readonly type: 'seen' }
    | { readonly type: 'soundHeard' }
    | { readonly type: 'reactionElapsed' }
    | { readonly type: 'inRange' }
    | { readonly type: 'outOfRange' }
    | { readonly type: 'losLost' }
    | { readonly type: 'investigateExpired' }
    | { readonly type: 'lowHealth' }
    | { readonly type: 'coverReached' }
    | { readonly type: 'hit'; readonly lethal: boolean }
    | { readonly type: 'stunExpired'; readonly resume: EnemyState };

const COMBAT_STATES: readonly EnemyState[] = ['patrol', 'investigate', 'alert', 'chase', 'attack', 'takeCover'];

export function transitionEnemyState(current: EnemyState, event: EnemyStateEvent): EnemyState {
    if (current === 'dead') {
        return 'dead';
    }
    if (event.type === 'hit') {
        return event.lethal ? 'dead' : 'stunned';
    }
    switch (current) {
        case 'idle':
            if (event.type === 'beginPatrol') return 'patrol';
            if (event.type === 'seen') return 'alert';
            if (event.type === 'soundHeard') return 'investigate';
            return current;
        case 'patrol':
            if (event.type === 'seen') return 'alert';
            if (event.type === 'soundHeard') return 'investigate';
            return current;
        case 'investigate':
            if (event.type === 'seen') return 'alert';
            if (event.type === 'investigateExpired') return 'patrol';
            return current;
        case 'alert':
            if (event.type === 'reactionElapsed') return 'chase';
            return current;
        case 'chase':
            if (event.type === 'inRange') return 'attack';
            if (event.type === 'losLost') return 'investigate';
            if (event.type === 'lowHealth') return 'takeCover';
            return current;
        case 'attack':
            if (event.type === 'outOfRange') return 'chase';
            if (event.type === 'losLost') return 'investigate';
            if (event.type === 'lowHealth') return 'takeCover';
            return current;
        case 'takeCover':
            if (event.type === 'coverReached') return 'attack';
            if (event.type === 'losLost') return 'investigate';
            return current;
        case 'stunned':
            if (event.type === 'stunExpired') {
                return COMBAT_STATES.includes(event.resume) ? event.resume : 'patrol';
            }
            return current;
        default:
            return current;
    }
}
