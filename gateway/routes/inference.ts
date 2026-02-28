import type { RouteHandler } from "../lib/router.js";
import { json } from "../lib/router.js";

export function inferenceRoutesRoute(deps: {
    anythingApiKey: string;
    ollamaModel: string;
    getOllamaRouteHealth: (baseUrl: string) => Promise<{ enabled: boolean; reason: string | null }>;
    ollamaBaseUrl: string;
}): RouteHandler {
    return async (_req, res) => {
        const ollamaHealth = await deps.getOllamaRouteHealth(deps.ollamaBaseUrl);
        json(res, 200, {
            ok: true,
            data: {
                default_path: "anythingllm",
                routes: {
                    anythingllm: {
                        enabled: Boolean(deps.anythingApiKey),
                        model: null,
                        reason: deps.anythingApiKey ? null : "ANYTHINGLLM_API_KEY is empty",
                    },
                    ollama: {
                        enabled: ollamaHealth.enabled,
                        model: deps.ollamaModel,
                        reason: ollamaHealth.reason,
                    },
                },
            },
        });
    };
}
