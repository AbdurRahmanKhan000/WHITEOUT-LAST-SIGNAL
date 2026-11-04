/**
 * Build 5 — score, rank and unlock rules (SRS section 7-D, FR-19/20).
 * Pure and unit-tested. The formula, exactly as implemented:
 *   score = kills * 100 + round(accuracy) * 2
 *         + max(0, parSeconds - timeSeconds) * 5 - damageReceived,
 * floored at 0. Accuracy is hits/shots * 100, capped at 100 (shotgun
 * pellets count as hits, so the cap matters). Rank thresholds:
 * S >= 1000, A >= 700, B >= 400, otherwise C. Unlock: completing a
 * level unlocks the next level id only (unlockedLevel is a single
 * frontier, never a set of individually unlocked levels).
 */

export type Rank = 'S' | 'A' | 'B' | 'C';

export interface ScoreInput {
    readonly kills: number;
    readonly accuracy: number;
    readonly timeSeconds: number;
    readonly damageReceived: number;
    readonly parSeconds: number;
}

export interface ScoreResult {
    readonly score: number;
    readonly rank: Rank;
}

export function calculateScore(input: ScoreInput): ScoreResult {
    const accuracyBonus = Math.round(Math.max(0, Math.min(100, input.accuracy))) * 2;
    const timeBonus = Math.max(0, input.parSeconds - input.timeSeconds) * 5;
    const score = Math.max(0, input.kills * 100 + accuracyBonus + timeBonus - Math.max(0, input.damageReceived));
    const rank: Rank = score >= 1000 ? 'S' : score >= 700 ? 'A' : score >= 400 ? 'B' : 'C';
    return { score, rank };
}

export function nextUnlockedLevel(currentUnlocked: number, completedLevelId: number, success: boolean): number {
    if (!success) {
        return currentUnlocked;
    }
    return Math.max(currentUnlocked, Math.min(31, completedLevelId + 1));
}
