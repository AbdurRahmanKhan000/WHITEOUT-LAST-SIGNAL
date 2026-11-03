import { DEFAULT_SAVE } from '../core/GameTypes';
import type { SaveData, Settings } from '../core/GameTypes';

/**
 * Local-only save (SRS sections 1.3, 7-D). IndexedDB is the primary store;
 * localStorage holds small preferences; an in-memory fallback keeps the
 * game playable in the current session when storage is unavailable
 * (NFR-12, section 13.2). Every read is validated and a malformed or
 * incompatible record falls back to the safe default instead of crashing.
 */
const DB_NAME = 'whiteout-last-signal';
const STORE_NAME = 'save';
const STORAGE_KEY = 'whiteout-last-signal-save-v1';

function isValidSave(value: unknown): value is SaveData {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return (
        record.schemaVersion === 1 &&
        typeof record.unlockedLevel === 'number' &&
        typeof record.bestResults === 'object' &&
        typeof record.settings === 'object' &&
        record.settings !== null
    );
}

function readLocalStorage(): SaveData | null {
    try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        if (raw === null || raw === undefined) {
            return null;
        }
        const parsed: unknown = JSON.parse(raw);
        return isValidSave(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export class SaveRepository {
    private memoryFallback: SaveData = DEFAULT_SAVE;
    private indexedDbFailed = false;

    async load(): Promise<SaveData> {
        const fromIndexedDb = await this.loadFromIndexedDb();
        if (fromIndexedDb !== null) {
            return fromIndexedDb;
        }
        return readLocalStorage() ?? this.memoryFallback;
    }

    async save(data: SaveData): Promise<void> {
        this.memoryFallback = data;
        try {
            globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch {
            // Quota or private-mode failure: the in-memory copy still works
            // for this session and the game must not crash (NFR-12).
        }
        await this.saveToIndexedDb(data);
    }

    async updateSettings(settings: Settings): Promise<SaveData> {
        const current = await this.load();
        const next: SaveData = { ...current, settings };
        await this.save(next);
        return next;
    }

    private loadFromIndexedDb(): Promise<SaveData | null> {
        if (this.indexedDbFailed || typeof globalThis.indexedDB === 'undefined') {
            return Promise.resolve(null);
        }
        return new Promise((resolve) => {
            try {
                const request = globalThis.indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => {
                    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                        request.result.createObjectStore(STORE_NAME);
                    }
                };
                request.onerror = () => {
                    this.indexedDbFailed = true;
                    resolve(null);
                };
                request.onsuccess = () => {
                    const db = request.result;
                    const tx = db.transaction(STORE_NAME, 'readonly');
                    const get = tx.objectStore(STORE_NAME).get('current');
                    get.onsuccess = () => {
                        db.close();
                        resolve(isValidSave(get.result) ? get.result : null);
                    };
                    get.onerror = () => {
                        db.close();
                        resolve(null);
                    };
                };
            } catch {
                this.indexedDbFailed = true;
                resolve(null);
            }
        });
    }

    private saveToIndexedDb(data: SaveData): Promise<void> {
        if (this.indexedDbFailed || typeof globalThis.indexedDB === 'undefined') {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            try {
                const request = globalThis.indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => {
                    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                        request.result.createObjectStore(STORE_NAME);
                    }
                };
                request.onerror = () => {
                    this.indexedDbFailed = true;
                    resolve();
                };
                request.onsuccess = () => {
                    const db = request.result;
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    tx.objectStore(STORE_NAME).put(data, 'current');
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onerror = () => {
                        db.close();
                        resolve();
                    };
                };
            } catch {
                this.indexedDbFailed = true;
                resolve();
            }
        });
    }
}
