import type { GameContext, GameSystem } from '../core/GameTypes';

/**
 * Owns system lifecycle (SRS section 4.1). Systems initialise in
 * registration order and dispose in reverse order, so a later system never
 * outlives a service it depends on.
 */
export class SystemRegistry {
    private readonly systems: GameSystem[] = [];
    private initialized = false;

    register(system: GameSystem): void {
        if (this.initialized) {
            throw new Error(`Cannot register ${system.name} after initialisation`);
        }
        if (this.systems.some((existing) => existing.name === system.name)) {
            throw new Error(`System already registered: ${system.name}`);
        }
        this.systems.push(system);
    }

    async initializeAll(context: GameContext): Promise<void> {
        for (const system of this.systems) {
            await system.initialize(context);
        }
        this.initialized = true;
    }

    updateAll(dt: number): void {
        for (const system of this.systems) {
            system.update?.(dt);
        }
    }

    fixedUpdateAll(fixedDt: number): void {
        for (const system of this.systems) {
            system.fixedUpdate?.(fixedDt);
        }
    }

    disposeAll(): void {
        for (const system of [...this.systems].reverse()) {
            system.dispose();
        }
        this.systems.length = 0;
        this.initialized = false;
    }

    get names(): readonly string[] {
        return this.systems.map((system) => system.name);
    }
}
