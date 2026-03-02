import type { RouteHandler } from "../lib/router.js";
import { json, readBody } from "../lib/router.js";
import { isChannelEnabled, markChannelActivity } from "../core/channel_control.js";
import { routeEvent } from "../core/router.js";
import type { BrainClient } from "../core/anythingllm_client.js";
import type { LineConnector } from "../connectors/line/connector.js";
import type { SendReplyByChannel } from "./types.js";
import { validateLineWebhookInput } from "../schemas/control_plane.js";

export function ingressLineRoute(deps: {
    lineConnector: LineConnector;
    brain: BrainClient;
    maxBodyBytes: number;
    sendReplyByChannel: SendReplyByChannel;
}): RouteHandler {
    return async (req, res) => {
        try {
            if (!isChannelEnabled("line")) {
                json(res, 503, { ok: false, error: "line channel is disabled" });
                return;
            }
            const raw = await readBody(req, deps.maxBodyBytes);
            const signature = req.headers["x-line-signature"];
            const signatureValue = Array.isArray(signature) ? signature[0] : signature;
            if (!deps.lineConnector.verifySignature(raw, signatureValue)) {
                json(res, 401, { ok: false, error: "invalid line signature" });
                return;
            }
            markChannelActivity("line");
            const parsed = JSON.parse(raw);
            const validated = validateLineWebhookInput(parsed);
            if (!validated.ok) {
                json(res, 400, { ok: false, error: validated.error });
                return;
            }
            const event = deps.lineConnector.toEvent(validated.value);
            const result = await routeEvent(event, deps.brain);
            await deps.sendReplyByChannel(event, result.reply);
            json(res, 200, { ok: true, trace_id: event.trace_id });
        } catch (error) {
            json(res, 500, { ok: false, error: (error as Error).message });
        }
    };
}
