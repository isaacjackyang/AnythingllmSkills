import type { RouteHandler } from "../lib/router.js";
import { json, readBody } from "../lib/router.js";
import { isChannelEnabled, markChannelActivity } from "../core/channel_control.js";
import { routeEvent } from "../core/router.js";
import type { BrainClient } from "../core/anythingllm_client.js";
import type { TelegramConnector } from "../connectors/telegram/connector.js";
import type { SendReplyByChannel } from "./types.js";

export function ingressTelegramRoute(deps: {
    connector: TelegramConnector;
    brain: BrainClient;
    maxBodyBytes: number;
    sendReplyByChannel: SendReplyByChannel;
}): RouteHandler {
    return async (req, res) => {
        try {
            if (!isChannelEnabled("telegram")) {
                json(res, 503, { ok: false, error: "telegram channel is disabled" });
                return;
            }
            const secretHeader = req.headers["x-telegram-bot-api-secret-token"];
            const secretValue = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;
            if (!deps.connector.verifyWebhookSecretToken(secretValue)) {
                json(res, 401, { ok: false, error: "invalid telegram webhook secret token" });
                return;
            }
            const raw = await readBody(req, deps.maxBodyBytes);
            markChannelActivity("telegram");
            const event = deps.connector.toEvent(JSON.parse(raw));
            const result = await routeEvent(event, deps.brain);
            await deps.sendReplyByChannel(event, result.reply);
            json(res, 200, { ok: true, trace_id: event.trace_id });
        } catch (error) {
            json(res, 500, { ok: false, error: (error as Error).message });
        }
    };
}
