/**
 * Tiny dependency-injection container (SRS section 4.1).
 * The composition root registers shared services; systems receive only the
 * container and ask for what they need by key. A missing service is a loud
 * error at startup, never a silent undefined at runtime.
 */
export class ServiceContainer {
    private readonly services = new Map<string, unknown>();

    register<T>(key: string, instance: T): void {
        if (this.services.has(key)) {
            throw new Error(`Service already registered: ${key}`);
        }
        this.services.set(key, instance);
    }

    get<T>(key: string): T {
        const instance = this.services.get(key);
        if (instance === undefined) {
            throw new Error(`Service not registered: ${key}`);
        }
        return instance as T;
    }

    has(key: string): boolean {
        return this.services.has(key);
    }

    dispose(): void {
        this.services.clear();
    }
}
