import type { RouteHandler } from "../lib/router.js";
import { json, readBody } from "../lib/router.js";
import { isChannelEnabled, markChannelActivity } from "../core/channel_control.js";
import { createEvent } from "../core/event.js";
import { routeEvent } from "../core/router.js";
import { buildPublicError } from "../lib/errors.js";
import type { BrainClient } from "../core/anythingllm_client.js";
import type { OllamaClient } from "../core/ollama_client.js";
import type { ResolveAgentContext } from "./types.js";
import type { SendReplyByChannel } from "./types.js";

export function commandRoute(deps: {
    brain: BrainClient;
    ollama: OllamaClient;
    workspace: string;
    ollamaModel: string;
    maxBodyBytes: number;
    resolveAgentContext: ResolveAgentContext;
    sendReplyByChannel: SendReplyByChannel;
}): RouteHandler {
    return async (req, res) => {
        try {
            if (!isChannelEnabled("web_ui")) {
                json(res, 503, { ok: false, error: "web_ui channel is disabled" });
                return;
            }
            const raw = await readBody(req, deps.maxBodyBytes);
            const payload = raw ? JSON.parse(raw) : {};
            const text = String(payload.text ?? "").trim();
            const path = String(payload.path ?? "anythingllm").trim();
            const context = await deps.resolveAgentContext(typeof payload.agent_id === "string" ? payload.agent_id : undefined);
            const confirmToken = typeof payload.confirm_token === "string" ? payload.confirm_token.trim() : "";
            if (!text && !confirmToken) throw new Error("text or confirm_token is required");
            if (!["anythingllm", "ollama"].includes(path)) throw new Error("path must be anythingllm or ollama");

            markChannelActivity("web_ui");

            const event = createEvent({
                channel: "web_ui",
                sender: { id: "approval-ui", display: "Approval UI", roles: ["operator"] },
                conversation: { thread_id: `approval-ui:${Date.now()}` },
                workspace: deps.workspace,
                agent: context.agent_name,
                message: { text, attachments: [] },
            });

            let reply = "";
            if (path === "ollama") {
                reply = await deps.ollama.generate(text);
            } else {
                const result = await routeEvent(event, deps.brain, { confirm_token: confirmToken || undefined });
                reply = result.reply;
            }
            await deps.sendReplyByChannel(event, reply);

            json(res, 200, { ok: true, trace_id: event.trace_id, reply, path, model: path === "ollama" ? deps.ollamaModel : undefined, agent: context });
        } catch (error) {
            console.error("/api/agent/command failed", error);
            const publicError = buildPublicError(error, "指令執行失敗，請檢查路徑設定或服務狀態", "AGENT_COMMAND_FAILED");
            json(res, 400, { ok: false, error: publicError.message, error_code: publicError.code });
        }
    };
}
