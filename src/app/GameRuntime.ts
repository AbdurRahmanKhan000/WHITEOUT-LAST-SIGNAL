import {
    AppBase,
    AppOptions,
    CameraComponentSystem,
    Color,
    ContainerHandler,
    Entity,
    FILLMODE_FILL_WINDOW,
    LightComponentSystem,
    RESOLUTION_AUTO,
    RenderComponentSystem,
    TextureHandler,
    createGraphicsDevice
} from 'playcanvas';

import { Clock } from '../core/Clock';
import type { Logger } from '../core/Logger';

import type { SystemRegistry } from './SystemRegistry';

/**
 * Composition root's engine owner (SRS section 4).
 * Build 0 scene: a neutral dark backdrop, camera and light only. No
 * character, arena or gameplay yet — those are Builds 1-3, and this file
 * must not pretend otherwise.
 */
export class GameRuntime {
    private app: AppBase | null = null;
    private readonly canvas: HTMLCanvasElement;
    private readonly registry: SystemRegistry;
    private readonly clock: Clock;
    private readonly logger: Logger;

    constructor(canvas: HTMLCanvasElement, registry: SystemRegistry, clock: Clock, logger: Logger) {
        this.canvas = canvas;
        this.registry = registry;
        this.clock = clock;
        this.logger = logger;
    }

    /** The PlayCanvas app, available after start() for systems that own scene entities. */
    get application(): AppBase | null {
        return this.app;
    }

    async start(): Promise<void> {
        const device = await createGraphicsDevice(this.canvas);
        device.maxPixelRatio = Math.min(window.devicePixelRatio, 2);

        const options = new AppOptions();
        options.graphicsDevice = device;
        options.componentSystems = [RenderComponentSystem, CameraComponentSystem, LightComponentSystem];
        options.resourceHandlers = [TextureHandler, ContainerHandler];

        const app = new AppBase(this.canvas);
        app.init(options);
        app.start();
        this.app = app;

        app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
        app.setCanvasResolution(RESOLUTION_AUTO);

        const resize = (): void => {
            app.resizeCanvas();
        };
        window.addEventListener('resize', resize);
        app.on('destroy', () => {
            window.removeEventListener('resize', resize);
        });

        const camera = new Entity('camera');
        camera.addComponent('camera', { clearColor: new Color(0.043, 0.086, 0.149) });
        camera.setPosition(0, 2, 6);
        camera.lookAt(0, 1, 0);
        app.root.addChild(camera);

        const light = new Entity('light');
        light.addComponent('light');
        light.setEulerAngles(45, 0, 0);
        app.root.addChild(light);

        app.on('update', (dt: number) => {
            const steps = this.clock.advance(dt);
            for (let i = 0; i < steps; i += 1) {
                this.registry.fixedUpdateAll(Clock.FIXED_STEP);
            }
            this.registry.updateAll(this.clock.clampDelta(dt));
        });

        this.logger.info('GameRuntime started');
    }

    dispose(): void {
        this.registry.disposeAll();
        this.app?.destroy();
        this.app = null;
    }
}
