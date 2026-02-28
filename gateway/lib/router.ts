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

  private addRoute(method: string, path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const patternStr = path.replace(/:([^/]+)/g, (_match, name) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    this.routes.push({ method, pattern: new RegExp(`^${patternStr}$`), paramNames, handler });
  }

  get(path: string, handler: RouteHandler): void { this.addRoute("GET", path, handler); }
  post(path: string, handler: RouteHandler): void { this.addRoute("POST", path, handler); }
  patch(path: string, handler: RouteHandler): void { this.addRoute("PATCH", path, handler); }
  delete(path: string, handler: RouteHandler): void { this.addRoute("DELETE", path, handler); }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const method = req.method ?? "GET";
    const urlObj = new URL(req.url ?? "/", "http://localhost");
    const pathname = urlObj.pathname;

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });

      await route.handler(req, res, params);
      return true;
    }

    return false;
  }
}

/* ── Shared helpers ────────────────────────────────────────── */

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
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
  });
}

export function parseQuery(req: IncomingMessage): URLSearchParams {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams;
}
