export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
    readonly level: LogLevel;
    readonly message: string;
    readonly timestamp: number;
}

/** Minimal structured logger. Entries are kept in memory for the debug shell. */
export class Logger {
    private readonly entries: LogEntry[] = [];
    private readonly minLevel: LogLevel;

    constructor(minLevel: LogLevel = 'info') {
        this.minLevel = minLevel;
    }

    debug(message: string): void {
        this.write('debug', message);
    }

    info(message: string): void {
        this.write('info', message);
    }

    warn(message: string): void {
        this.write('warn', message);
    }

    error(message: string): void {
        this.write('error', message);
    }

    private write(level: LogLevel, message: string): void {
        const order: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
        this.entries.push({ level, message, timestamp: Date.now() });
        if (order[level] >= order[this.minLevel]) {
            const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
            sink(`[whiteout:${level}] ${message}`);
        }
    }

    getEntries(): readonly LogEntry[] {
        return this.entries;
    }
}
