/**
 * Build 4 — test-arena result tracking (SRS section 7-E, results shell).
 * Pure state: UISystem feeds it events and renders the summary, so the
 * counting rules are unit-testable without a DOM. Accuracy counts
 * confirmed hits per shot, capped at 100: a shotgun pellet is a hit,
 * so uncapped shotgun accuracy could exceed 100 and would be a lie.
 */
export interface ArenaSummary {
    readonly kills: number;
    readonly shots: number;
    readonly hits: number;
    readonly accuracy: number;
    readonly timeSeconds: number;
    readonly cleared: boolean;
}

export class ArenaStats {
    private shots = 0;
    private hits = 0;
    private kills = 0;
    private startedAt = 0;
    private elapsed = 0;
    private running = false;

    reset(nowSeconds: number): void {
        this.shots = 0;
        this.hits = 0;
        this.kills = 0;
        this.startedAt = nowSeconds;
        this.elapsed = 0;
        this.running = true;
    }

    stop(nowSeconds: number): void {
        if (this.running) {
            this.elapsed = Math.max(0, nowSeconds - this.startedAt);
            this.running = false;
        }
    }

    onShot(): void {
        this.shots += 1;
    }

    onHit(): void {
        this.hits += 1;
    }

    onKill(): void {
        this.kills += 1;
    }

    summary(nowSeconds: number, totalEnemies: number): ArenaSummary {
        const timeSeconds = this.running ? Math.max(0, nowSeconds - this.startedAt) : this.elapsed;
        const accuracy = this.shots > 0 ? Math.min(100, (this.hits / this.shots) * 100) : 0;
        return {
            kills: this.kills,
            shots: this.shots,
            hits: this.hits,
            accuracy: Math.round(accuracy),
            timeSeconds: Math.round(timeSeconds),
            cleared: this.kills >= totalEnemies && totalEnemies > 0
        };
    }
}
