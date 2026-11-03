import { describe, expect, it, vi } from 'vitest';

import { GameStateMachine } from '../../src/app/GameStateMachine';
import { Clock } from '../../src/core/Clock';
import { EventBus } from '../../src/core/EventBus';
import { DEFAULT_SAVE } from '../../src/core/GameTypes';
import { ServiceContainer } from '../../src/core/ServiceContainer';
import { SaveRepository } from '../../src/services/SaveRepository';

describe('EventBus', () => {
    it('delivers typed payloads and unsubscribes', () => {
        const bus = new EventBus();
        const handler = vi.fn();
        const unsubscribe = bus.on('player.healthChanged', handler);
        bus.emit('player.healthChanged', { current: 80, maximum: 100, delta: -20 });
        expect(handler).toHaveBeenCalledWith({ current: 80, maximum: 100, delta: -20 });
        unsubscribe();
        bus.emit('player.healthChanged', { current: 70, maximum: 100, delta: -10 });
        expect(handler).toHaveBeenCalledTimes(1);
        bus.dispose();
    });

    it('once fires exactly once', () => {
        const bus = new EventBus();
        const handler = vi.fn();
        bus.once('entity.died', handler);
        const payload = {
            entityId: 'e1',
            entityType: 'enemy' as const,
            killerId: 'player',
            position: [0, 0, 0] as const
        };
        bus.emit('entity.died', payload);
        bus.emit('entity.died', payload);
        expect(handler).toHaveBeenCalledTimes(1);
    });
});

describe('GameStateMachine', () => {
    it('allows SRS transitions and rejects illegal ones', () => {
        const bus = new EventBus();
        const machine = new GameStateMachine(bus);
        expect(machine.current).toBe('boot');
        expect(machine.transitionTo('playing')).toBe(false);
        expect(machine.transitionTo('mainMenu')).toBe(true);
        expect(machine.transitionTo('loading')).toBe(true);
        expect(machine.transitionTo('playing')).toBe(true);
        expect(machine.transitionTo('mainMenu')).toBe(false);
        expect(machine.current).toBe('playing');
    });
});

describe('ServiceContainer', () => {
    it('throws for unregistered services and duplicate registration', () => {
        const services = new ServiceContainer();
        expect(() => services.get('missing')).toThrow('Service not registered');
        services.register('answer', 42);
        expect(services.get<number>('answer')).toBe(42);
        expect(() => services.register('answer', 43)).toThrow('already registered');
    });
});

describe('Clock', () => {
    it('bounds delta time and steps at a fixed 1/60 s', () => {
        const clock = new Clock();
        expect(clock.clampDelta(10)).toBe(Clock.MAX_DELTA);
        expect(clock.clampDelta(-1)).toBe(0);
        expect(clock.advance(1 / 60)).toBe(1);
        expect(clock.advance(1 / 120)).toBe(0);
        expect(clock.advance(1 / 120)).toBe(1);
    });
});

describe('SaveRepository', () => {
    it('round-trips a save and falls back to the default in this environment', async () => {
        const repo = new SaveRepository();
        const loaded = await repo.load();
        expect(loaded.schemaVersion).toBe(1);
        const next = { ...DEFAULT_SAVE, unlockedLevel: 3 };
        await repo.save(next);
        expect((await repo.load()).unlockedLevel).toBe(3);
    });
});
