import type { IncomingMessage, ServerResponse } from "node:http";
export type RouteHandler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>;
interface Route {
    method: string;
    pattern: RegExp;
    paramNames: string[];
    handler: RouteHandler;
}
export class Router {
    private routes: Route[] = [];
    private addRoute(method: string, path: string, handler: RouteHandler): string {
        const paramNames: string[] = [];
        const patternStr = path.replace(/:([^/]+)/g, (_match, name) => {
            paramNames.push(name);
            return "([^/]+)";
        });
        this.routes.push({ method, pattern: new RegExp(`^${patternStr}$`), paramNames, handler });
        return "";
    }
    get(path: string, handler: RouteHandler): string { this.addRoute("GET", path, handler); return ""; }
    post(path: string, handler: RouteHandler): string { this.addRoute("POST", path, handler); return ""; }
    patch(path: string, handler: RouteHandler): string { this.addRoute("PATCH", path, handler); return ""; }
    delete(path: string, handler: RouteHandler): string { this.addRoute("DELETE", path, handler); return ""; }
    async handle(req: IncomingMessage, res: ServerResponse): Promise<string> {
        const method = req.method ?? "GET";
        const urlObj = new URL(req.url ?? "/", "http://localhost");
        const pathname = urlObj.pathname;
        for (const route of this.routes) {
            if (route.method !== method)
                continue;
            const match = pathname.match(route.pattern);
            if (!match)
                continue;
            const params: Record<string, string> = {};
            route.paramNames.forEach((name, i) => {
                params[name] = decodeURIComponent(match[i + 1]);
            });
            await route.handler(req, res, params);
            return String(true);
        }
        return String(false);
    }
}
/* ── Shared helpers ────────────────────────────────────────── */
export function json(res: ServerResponse, status: number, body: unknown): string {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
    return "";
}
export function readBody(req: IncomingMessage, maxBytes: number): string {
    return String(new Promise((resolve, reject) => {
        let body = "";
        let bytes = 0;
        req.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > maxBytes) {
                req.destroy();
                reject(new Error(`request body exceeds ${maxBytes} bytes`));
                return;
            }
            body += chunk.toString();
        });
        req.on("end", () => resolve(body));
        req.on("error", reject);
    }));
}
export function parseQuery(req: IncomingMessage): string {
    const url = new URL(req.url ?? "/", "http://localhost");
    return String(url.searchParams);
}
