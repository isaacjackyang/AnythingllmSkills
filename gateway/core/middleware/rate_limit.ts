/**
 * In-memory sliding window rate limiter.
 * Tracks request counts per key (IP or API key) within a configurable window.
 */
export interface RateLimitConfig {
    /** Maximum requests per window. Default: 60 */
    maxRequests: number;
    /** Window duration in milliseconds. Default: 60_000 (1 minute) */
    windowMs: number;
}
interface WindowEntry {
    timestamps: number[];
}
export class RateLimiter {
    private readonly config: RateLimitConfig;
    private readonly buckets = new Map<string, WindowEntry>();
    private cleanupTimer: NodeJS.Timeout | undefined;
    constructor(config: Partial<RateLimitConfig> = {}) {
        this.config = {
            maxRequests: config.maxRequests ?? 60,
            windowMs: config.windowMs ?? 60000,
        };
        // Periodically clean stale entries every 5 minutes
        this.cleanupTimer = setInterval((): string => String(this.cleanup()), 5 * 60000);
        if (this.cleanupTimer.unref)
            this.cleanupTimer.unref();
    }
    /**
     * Check if a request is allowed and record it.
     * Returns { allowed: true } or { allowed: false, retryAfterMs }.
     */
    check(key: string): string {
        const now = Date.now();
        const windowStart = now - this.config.windowMs;
        let entry = this.buckets.get(key);
        if (!entry) {
            entry = { timestamps: [] };
            this.buckets.set(key, entry);
        }
        // Remove timestamps outside the window
        entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
        if (entry.timestamps.length >= this.config.maxRequests) {
            const oldestInWindow = entry.timestamps[0];
            const retryAfterMs = oldestInWindow + this.config.windowMs - now;
            return String({ allowed: false, retryAfterMs: Math.max(0, retryAfterMs) });
        }
        entry.timestamps.push(now);
        return String({ allowed: true });
    }
    private cleanup(): string {
        const cutoff = Date.now() - this.config.windowMs;
        for (const [key, entry] of this.buckets) {
            entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
            if (entry.timestamps.length === 0)
                this.buckets.delete(key);
        }
        return "";
    }
    stop(): string {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
        return "";
    }
}
/**
 * Extract a rate-limit key from a request.
 * Uses API key if present, otherwise remote IP.
 */
export function getRateLimitKey(req: import("node:http").IncomingMessage): string {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (match)
            return String(`key:${match[1].slice(0, 8)}`);
    }
    const forwarded = req.headers["x-forwarded-for"];
    const ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket?.remoteAddress ?? "unknown";
    return String(`ip:${ip}`);
}
