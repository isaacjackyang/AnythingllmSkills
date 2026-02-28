import type { RouteHandler } from "../lib/router.js";
import { json, readBody, parseQuery } from "../lib/router.js";
import { createAgent, ensurePrimaryAgent, listAgents, updateAgent } from "../core/agents_registry.js";
import type { ResolveAgentContext } from "./types.js";

export function listAgentsRoute(defaultAgentName: string, defaultModel: string): RouteHandler {
    return async (_req, res) => {
        try {
            await ensurePrimaryAgent(defaultAgentName, defaultModel);
            const data = await listAgents();
            json(res, 200, { ok: true, data });
        } catch (error) {
            json(res, 500, { ok: false, error: (error as Error).message });
        }
    };
}

export function createAgentRoute(defaultModel: string, maxBodyBytes: number): RouteHandler {
    return async (req, res) => {
        try {
            const raw = await readBody(req, maxBodyBytes);
            const payload = raw ? JSON.parse(raw) : {};
            const name = String(payload.name ?? "").trim();
            const model = String(payload.model ?? defaultModel).trim();
            const soul = String(payload.soul ?? "operations").trim();
            const communicationMode = payload.communication_mode === "direct" ? "direct" : "hub_and_spoke";
            if (!name) throw new Error("name is required");
            const created = await createAgent({ name, model, soul, communication_mode: communicationMode });
            json(res, 200, { ok: true, data: created });
        } catch (error) {
            json(res, 400, { ok: false, error: (error as Error).message });
        }
    };
}

export function patchAgentRoute(maxBodyBytes: number): RouteHandler {
    return async (req, res, params) => {
        try {
            const agentId = params.id;
            if (!agentId) throw new Error("agent id is required");
            const raw = await readBody(req, maxBodyBytes);
            const payload = raw ? JSON.parse(raw) : {};
            const updated = await updateAgent(agentId, payload);
            json(res, 200, { ok: true, data: updated });
        } catch (error) {
            json(res, 400, { ok: false, error: (error as Error).message });
        }
    };
}

export function agentCommunicationsRoute(defaultAgentName: string, defaultModel: string): RouteHandler {
    return async (_req, res) => {
        try {
            await ensurePrimaryAgent(defaultAgentName, defaultModel);
            const data = await listAgents();
            const links = data.flatMap((item) => data
                .filter((peer) => peer.id !== item.id)
                .filter((peer) => item.communication_mode === "direct" || item.is_primary || peer.is_primary)
                .map((peer) => ({ from: item.id, to: peer.id, mode: item.communication_mode })));
            json(res, 200, { ok: true, data: links });
        } catch (error) {
            json(res, 500, { ok: false, error: (error as Error).message });
        }
    };
}
