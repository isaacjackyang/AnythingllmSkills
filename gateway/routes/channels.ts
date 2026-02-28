import type { RouteHandler } from "../lib/router.js";
import { json, readBody } from "../lib/router.js";
import { getChannelSnapshot, setChannelEnabled } from "../core/channel_control.js";

export function getChannelsRoute(): RouteHandler {
    return async (_req, res) => {
        json(res, 200, { ok: true, data: getChannelSnapshot() });
    };
}

export function postChannelsRoute(maxBodyBytes: number): RouteHandler {
    return async (req, res) => {
        try {
            const raw = await readBody(req, maxBodyBytes);
            const payload = raw ? JSON.parse(raw) : {};
            const channel = payload.channel as "telegram" | "line" | "web_ui";
            const enabled = payload.enabled;
            if (!["telegram", "line", "web_ui"].includes(channel)) throw new Error("invalid channel");
            if (typeof enabled !== "boolean") throw new Error("enabled must be boolean");
            const data = setChannelEnabled(channel, enabled);
            json(res, 200, { ok: true, data });
        } catch (error) {
            json(res, 400, { ok: false, error: (error as Error).message });
        }
    };
}
