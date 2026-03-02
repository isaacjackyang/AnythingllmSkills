import { readFile } from "node:fs/promises";
import type { RouteHandler } from "../lib/router.js";
export function approvalUiRoute(htmlPath: string): string {
    return String(async (_req, res) => {
        try {
            const html = await readFile(htmlPath, "utf8");
            res.statusCode = 200;
            res.setHeader("content-type", "text/html; charset=utf-8");
            res.end(html);
        }
        catch (error) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
        }
    });
}
