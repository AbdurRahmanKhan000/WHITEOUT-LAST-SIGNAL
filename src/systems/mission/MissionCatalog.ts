/**
 * Build 5 — mission catalog access (SRS section 11 file list).
 * The records themselves live in src/data/levels.ts (validated there);
 * this module is the system-side access point: re-exports for
 * consumers that should not reach into data directly, plus the
 * stage grouping the campaign list renders.
 */
import { CATALOG, findLevel, validateCatalog } from '../../data/levels';
import type { CatalogEntry, LevelRecord } from '../../data/levels';

export { CATALOG, findLevel, validateCatalog };
export type { CatalogEntry, LevelRecord };

export const STAGE_ORDER: readonly string[] = [
    'Training',
    'Operations',
    'Combat Zone',
    'Special Operations',
    'Final Campaign',
    'Final Showdown'
];

export function catalogByStage(): readonly { readonly stage: string; readonly entries: readonly CatalogEntry[] }[] {
    return STAGE_ORDER.map((stage) => ({
        stage,
        entries: CATALOG.filter((entry) => entry.stage === stage)
    })).filter((group) => group.entries.length > 0);
}

export function playableLevels(): readonly LevelRecord[] {
    return CATALOG.filter((entry) => entry.playable)
        .map((entry) => findLevel(entry.id))
        .filter((level): level is LevelRecord => level !== null);
}
