/**
 * Frame-rate-independent timing (SRS section 4.1).
 * Rendering delta time is bounded so a hitch cannot teleport gameplay, and
 * simulation advances in fixed 1/60 s steps kept separate from rendering.
 */
export class Clock {
    static readonly FIXED_STEP = 1 / 60;
    static readonly MAX_DELTA = 1 / 20;

    private accumulator = 0;

    clampDelta(dt: number): number {
        if (!Number.isFinite(dt) || dt < 0) {
            return 0;
        }
        return Math.min(dt, Clock.MAX_DELTA);
    }

    /** Returns how many fixed steps the bounded delta time earns. */
    advance(dt: number): number {
        this.accumulator += this.clampDelta(dt);
        let steps = 0;
        while (this.accumulator >= Clock.FIXED_STEP) {
            this.accumulator -= Clock.FIXED_STEP;
            steps += 1;
        }
        // Never let a long pause queue an unbounded catch-up burst.
        if (steps > 5) {
            steps = 5;
            this.accumulator = 0;
        }
        return steps;
    }

    reset(): void {
        this.accumulator = 0;
    }
}
