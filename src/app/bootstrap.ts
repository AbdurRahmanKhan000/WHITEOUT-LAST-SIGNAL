import { Clock } from '../core/Clock';
import { EventBus } from '../core/EventBus';
import { Logger } from '../core/Logger';
import { ServiceContainer } from '../core/ServiceContainer';
import { SaveRepository } from '../services/SaveRepository';
import { AudioSystem } from '../systems/audio/AudioSystem';
import { EnemySystem } from '../systems/enemy/EnemySystem';
import { GraphicsSystem } from '../systems/graphics/GraphicsSystem';
import { PlayerSystem } from '../systems/player/PlayerSystem';
import { UISystem } from '../systems/ui/UISystem';

import { GameRuntime } from './GameRuntime';
import { GameStateMachine } from './GameStateMachine';
import { SystemRegistry } from './SystemRegistry';

/**
 * Build 0 bootstrap (SRS section 4.2, Boot state).
 * Creates the engine, shared services and systems in dependency order,
 * then moves Boot -> MainMenu. Any failure lands in the error shell
 * (FR-01) instead of a blank page.
 */
export async function bootstrap(canvas: HTMLCanvasElement): Promise<GameRuntime> {
    const eventBus = new EventBus();
    const logger = new Logger();
    const services = new ServiceContainer();
    const clock = new Clock();
    const stateMachine = new GameStateMachine(eventBus);
    const registry = new SystemRegistry();

    services.register('eventBus', eventBus);
    services.register('logger', logger);
    services.register('clock', clock);
    services.register('save', new SaveRepository());
    services.register('stateMachine', stateMachine);

    // Build 3: both gameplay systems are constructed once, registered in
    // the container BEFORE any system initialises (so each can obtain the
    // other through its typed service interface), then registered with
    // the registry. PlayerSystem treats the enemy system as optional;
    // EnemySystem treats the player snapshot the same way.
    const playerSystem = new PlayerSystem();
    const enemySystem = new EnemySystem();
    services.register('playerSystem', playerSystem);
    services.register('enemySystem', enemySystem);

    registry.register(new UISystem());
    registry.register(new AudioSystem());
    registry.register(playerSystem);
    registry.register(enemySystem);
    registry.register(new GraphicsSystem());

    const runtime = new GameRuntime(canvas, registry, clock, logger);
    try {
        await runtime.start();
        const app = runtime.application;
        if (app === null) {
            throw new Error('PlayCanvas app was not created');
        }
        services.register('app', app);
        await registry.initializeAll({ eventBus, services, logger });
        if (!stateMachine.transitionTo('mainMenu')) {
            throw new Error('Boot could not transition to MainMenu');
        }
        logger.info('WHITEOUT: Last Signal — Build 0 boot complete');
        return runtime;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown boot failure';
        logger.error(`Boot failed: ${message}`);
        eventBus.emit('app.error', { message, recoverable: true });
        const overlay = document.getElementById('error-overlay');
        const messageElement = document.getElementById('error-message');
        if (overlay !== null) overlay.hidden = false;
        if (messageElement !== null) messageElement.textContent = message;
        stateMachine.transitionTo('error');
        throw error;
    }
}
