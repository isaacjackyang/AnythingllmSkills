import type { RouteHandler } from "../lib/router.js";
import { json } from "../lib/router.js";
import { getLifecycleSnapshot, updateSoul } from "../core/lifecycle.js";
import { readBody } from "../lib/router.js";

export function healthzRoute(maxBodyBytes: number): RouteHandler {
    return async (_req, res) => {
        const lifecycle = getLifecycleSnapshot();
        json(res, lifecycle.status === "ok" ? 200 : 503, {
            ok: lifecycle.status === "ok",
            status: lifecycle.status,
            heartbeat_age_ms: lifecycle.heartbeat.age_ms,
        });
    };
}

export function lifecycleRoute(): RouteHandler {
    return async (_req, res) => {
        const lifecycle = getLifecycleSnapshot();
        json(res, lifecycle.status === "ok" ? 200 : 503, lifecycle);
    };
}

export function soulRoute(maxBodyBytes: number): RouteHandler {
    return async (req, res) => {
        try {
            const raw = await readBody(req, maxBodyBytes);
            const payload = raw ? JSON.parse(raw) : {};
            const soul = updateSoul(payload as { role?: string; node_env?: string });
            json(res, 200, { ok: true, soul });
        } catch (error) {
            json(res, 400, { ok: false, error: (error as Error).message });
        }
    };
}
