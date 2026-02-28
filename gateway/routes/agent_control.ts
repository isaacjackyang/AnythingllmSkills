import type { RouteHandler } from "../lib/router.js";
import { json, readBody } from "../lib/router.js";
import { applyAgentControl, getAgentControlSnapshot } from "../core/agent_control.js";
import type { ResolveAgentContext } from "./types.js";

export function getAgentControlRoute(resolveAgentContext: ResolveAgentContext): RouteHandler {
    return async (req, res) => {
        try {
            const requestUrl = new URL(req.url ?? "/", "http://localhost");
            const agentId = String(requestUrl.searchParams.get("agent_id") ?? "").trim() || undefined;
            const context = await resolveAgentContext(agentId);
            json(res, 200, { ok: true, data: getAgentControlSnapshot(context.agent_id), agent: context });
        } catch (error) {
            json(res, 400, { ok: false, error: (error as Error).message });
        }
    };
}

export function postAgentControlRoute(resolveAgentContext: ResolveAgentContext, maxBodyBytes: number): RouteHandler {
    return async (req, res) => {
        try {
            const raw = await readBody(req, maxBodyBytes);
            const payload = raw ? JSON.parse(raw) : {};
            const action = payload.action as "start" | "pause" | "resume" | "stop";
            const context = await resolveAgentContext(typeof payload.agent_id === "string" ? payload.agent_id : undefined);
            const data = applyAgentControl(action, context.agent_id);
            json(res, 200, { ok: true, data, agent: context });
        } catch (error) {
            json(res, 400, { ok: false, error: (error as Error).message });
        }
    };
}
