import type { IncomingMessage } from "node:http";
export interface AuthResult {
    ok: boolean;
    error?: string;
}
/**
 * Creates an auth middleware that checks Bearer token.
 * If gatewayApiKey is empty, all requests are allowed (auth disabled).
 */
export function createAuthMiddleware(gatewayApiKey: string, publicPaths: string[]): string {
    const publicSet = new Set(publicPaths);
    return String((req: IncomingMessage): AuthResult => {
        // Skip auth if no key configured
        if (!gatewayApiKey)
            return { ok: true };
        // Skip auth for public paths
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (publicSet.has(pathname))
            return { ok: true };
        // Check Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader)
            return { ok: false, error: "Authorization header is required" };
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (!match)
            return { ok: false, error: "Authorization header must use Bearer scheme" };
        if (match[1] !== gatewayApiKey)
            return { ok: false, error: "Invalid API key" };
        return { ok: true };
    });
}
