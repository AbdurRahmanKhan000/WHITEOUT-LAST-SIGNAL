/**
 * Keyboard / mouse input adapter (SRS section 6-A, Input adapter).
 * Normalises raw browser input into commands the PlayerSystem consumes.
 * Pointer lock is requested only from a user gesture (the arena button);
 * losing it (Esc, tab switch, focus loss) is reported, never ignored.
 */
export class InputAdapter {
    private readonly keys = new Set<string>();
    private readonly mouseButtons = new Set<number>();
    private leftClickPending = false;
    private mouseDeltaX = 0;
    private mouseDeltaY = 0;
    private readonly cleanups: (() => void)[] = [];
    private readonly canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    attach(onLockChange: () => void): void {
        const keyDown = (event: KeyboardEvent): void => {
            this.keys.add(event.code);
        };
        const keyUp = (event: KeyboardEvent): void => {
            this.keys.delete(event.code);
        };
        const mouseMove = (event: MouseEvent): void => {
            if (document.pointerLockElement === this.canvas) {
                this.mouseDeltaX += event.movementX;
                this.mouseDeltaY += event.movementY;
            }
        };
        const lockChange = (): void => {
            onLockChange();
        };
        const blur = (): void => {
            this.keys.clear();
            this.mouseButtons.clear();
            this.leftClickPending = false;
        };
        const mouseDown = (event: MouseEvent): void => {
            this.mouseButtons.add(event.button);
            if (event.button === 0) {
                this.leftClickPending = true;
            }
        };
        const mouseUp = (event: MouseEvent): void => {
            this.mouseButtons.delete(event.button);
        };
        window.addEventListener('keydown', keyDown);
        window.addEventListener('keyup', keyUp);
        window.addEventListener('mousemove', mouseMove);
        window.addEventListener('mousedown', mouseDown);
        window.addEventListener('mouseup', mouseUp);
        document.addEventListener('pointerlockchange', lockChange);
        window.addEventListener('blur', blur);
        this.cleanups.push(
            () => window.removeEventListener('keydown', keyDown),
            () => window.removeEventListener('keyup', keyUp),
            () => window.removeEventListener('mousemove', mouseMove),
            () => window.removeEventListener('mousedown', mouseDown),
            () => window.removeEventListener('mouseup', mouseUp),
            () => document.removeEventListener('pointerlockchange', lockChange),
            () => window.removeEventListener('blur', blur)
        );
    }

    detach(): void {
        for (const cleanup of this.cleanups.splice(0)) {
            cleanup();
        }
        this.keys.clear();
    }

    has(code: string): boolean {
        return this.keys.has(code);
    }

    isLeftDown(): boolean {
        return this.mouseButtons.has(0);
    }

    /** True once per left press; semi-auto weapons consume it, auto weapons use isLeftDown(). */
    consumeLeftClick(): boolean {
        if (!this.leftClickPending) {
            return false;
        }
        this.leftClickPending = false;
        return true;
    }

    consumeMouseDelta(): { readonly x: number; readonly y: number } {
        const delta = { x: this.mouseDeltaX, y: this.mouseDeltaY };
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        return delta;
    }

    get pointerLocked(): boolean {
        return document.pointerLockElement === this.canvas;
    }

    requestPointerLock(): void {
        if (!this.pointerLocked) {
            void this.canvas.requestPointerLock();
        }
    }

    releasePointerLock(): void {
        if (this.pointerLocked) {
            document.exitPointerLock();
        }
    }
}
