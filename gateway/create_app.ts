import { createServer, type Server } from "node:http";
import path from "node:path";
import { Router, json } from "./lib/router.js";
import { parseHeartbeatInterval, startHeartbeat, stopHeartbeat } from "./core/lifecycle.js";
import { startJobRunner, stopJobRunner } from "./workers/job_runner.js";
import { TelegramConnector } from "./connectors/telegram/connector.js";
import { LineConnector } from "./connectors/line/connector.js";
import { AnythingLlmClient } from "./core/anythingllm_client.js";
import { OllamaClient } from "./core/ollama_client.js";
import { ensurePrimaryAgent, getAgentById } from "./core/agents_registry.js";
import type { Event } from "./core/event.js";

// Routes
import { healthzRoute, lifecycleRoute, soulRoute } from "./routes/health.js";
import { getAgentControlRoute, postAgentControlRoute } from "./routes/agent_control.js";
import { listAgentsRoute, createAgentRoute, patchAgentRoute, agentCommunicationsRoute } from "./routes/agents.js";
import { getChannelsRoute, postChannelsRoute } from "./routes/channels.js";
import { commandRoute } from "./routes/command.js";
import { inferenceRoutesRoute } from "./routes/inference.js";
import { memoryFilesRoute, memoryFileRoute, memorySearchRoute, memoryLearnRoute, memoryArchitectureRoute, memoryWorkflowsListRoute, memoryWorkflowsRunRoute } from "./routes/memory.js";
import { listTasksRoute, getTaskRoute, cancelTaskRoute, deleteTaskRoute, runOnceRoute } from "./routes/tasks.js";
import { listApprovalsRoute, decideApprovalRoute } from "./routes/approvals.js";
import { ingressTelegramRoute } from "./routes/ingress_telegram.js";
import { ingressLineRoute } from "./routes/ingress_line.js";
import { approvalUiRoute } from "./routes/ui.js";
import { systemInitRoute } from "./routes/system.js";

// Middleware
import { createAuthMiddleware } from "./core/middleware/auth.js";
import { RateLimiter, getRateLimitKey } from "./core/middleware/rate_limit.js";
import { listAgentMessages, sendAgentMessage, markMessageRead, getPendingMessageCount } from "./core/agent_messaging.js";
import { registerBuiltInHooks } from "./core/autonomy_hooks.js";

/* ── Config ────────────────────────────────────────── */

function parsePositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw || !raw.trim()) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        console.warn(`[config] ${name}=${raw} is invalid, falling back to ${fallback}`);
        return fallback;
    }
    return Math.floor(parsed);
}

export interface AppConfig {
    port: number;
    telegramToken: string;
    telegramWebhookSecret?: string;
    lineChannelAccessToken: string;
    lineChannelSecret?: string;
    anythingBaseUrl: string;
    anythingApiKey: string;
    workspace: string;
    defaultAgentName: string;
    ollamaBaseUrl: string;
    ollamaModel: string;
    ollamaTimeoutMs: number;
    upstreamRetryMaxAttempts: number;
    upstreamRetryBaseDelayMs: number;
    heartbeatIntervalMs: number;
    maxBodyBytes: number;
    maxMemoryFileReadBytes: number;
    taskRunnerIntervalMs: number;
    gatewayApiKey: string;
    rateLimitPerMinute: number;
}

export function loadConfigFromEnv(): AppConfig {
    return {
        port: parsePositiveIntEnv("PORT", 8787),
        telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
        telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
        lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
        lineChannelSecret: process.env.LINE_CHANNEL_SECRET,
        anythingBaseUrl: process.env.ANYTHINGLLM_BASE_URL ?? "http://localhost:3001",
        anythingApiKey: process.env.ANYTHINGLLM_API_KEY ?? "",
        workspace: process.env.DEFAULT_WORKSPACE ?? "maiecho-prod",
        defaultAgentName: process.env.DEFAULT_AGENT ?? "ops-agent",
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
        ollamaModel: process.env.OLLAMA_MODEL ?? "gpt-oss:20b",
        ollamaTimeoutMs: parsePositiveIntEnv("OLLAMA_TIMEOUT_MS", 12_000),
        upstreamRetryMaxAttempts: parsePositiveIntEnv("UPSTREAM_RETRY_MAX_ATTEMPTS", 2),
        upstreamRetryBaseDelayMs: parsePositiveIntEnv("UPSTREAM_RETRY_BASE_DELAY_MS", 200),
        heartbeatIntervalMs: parseHeartbeatInterval(process.env.HEARTBEAT_INTERVAL_MS, 10_000),
        maxBodyBytes: parsePositiveIntEnv("MAX_BODY_BYTES", 1024 * 1024),
        maxMemoryFileReadBytes: parsePositiveIntEnv("MAX_MEMORY_FILE_READ_BYTES", 256 * 1024),
        taskRunnerIntervalMs: parsePositiveIntEnv("TASK_RUNNER_INTERVAL_MS", 2_000),
        gatewayApiKey: process.env.GATEWAY_API_KEY ?? "",
        rateLimitPerMinute: parsePositiveIntEnv("RATE_LIMIT_PER_MINUTE", 60),
    };
}

/* ── Ollama health check ────────────────────────────── */

async function getOllamaRouteHealth(baseUrl: string): Promise<{ enabled: boolean; reason: string | null }> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2_000);
        const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) return { enabled: false, reason: `ollama returned ${response.status}` };
        return { enabled: true, reason: null };
    } catch (error) {
        return { enabled: false, reason: (error as Error).message };
    }
}

/* ── App Builder ────────────────────────────────────── */

export function createApp(config: AppConfig): { server: Server; shutdown: () => Promise<void> } {
    // Warnings
    if (!config.telegramToken) console.warn("TELEGRAM_BOT_TOKEN is empty: telegram sendReply will fail");
    if (!config.lineChannelAccessToken) console.warn("LINE_CHANNEL_ACCESS_TOKEN is empty: line sendReply will fail");
    if (!config.anythingApiKey) console.warn("ANYTHINGLLM_API_KEY is empty: brain calls will fail");
    if (!config.gatewayApiKey) console.warn("GATEWAY_API_KEY is empty: API authentication is disabled (all requests allowed)");

    // Services
    startHeartbeat(config.heartbeatIntervalMs);
    registerBuiltInHooks();
    startJobRunner(config.taskRunnerIntervalMs);

    const connector = new TelegramConnector({
        botToken: config.telegramToken,
        webhookSecretToken: config.telegramWebhookSecret,
        defaultWorkspace: config.workspace,
        defaultAgent: config.defaultAgentName,
    });

    const lineConnector = new LineConnector({
        channelAccessToken: config.lineChannelAccessToken,
        channelSecret: config.lineChannelSecret,
        defaultWorkspace: config.workspace,
        defaultAgent: config.defaultAgentName,
    });

    const brain = new AnythingLlmClient({
        baseUrl: config.anythingBaseUrl,
        apiKey: config.anythingApiKey,
        maxRetries: Math.max(0, config.upstreamRetryMaxAttempts - 1),
        retryBaseDelayMs: config.upstreamRetryBaseDelayMs,
    });

    const ollama = new OllamaClient({
        baseUrl: config.ollamaBaseUrl,
        model: config.ollamaModel,
        timeoutMs: config.ollamaTimeoutMs,
        maxRetries: Math.max(0, config.upstreamRetryMaxAttempts - 1),
        retryBaseDelayMs: config.upstreamRetryBaseDelayMs,
    });

    // Shared helpers
    async function resolveAgentContext(agentId?: string) {
        const primary = await ensurePrimaryAgent(config.defaultAgentName, config.ollamaModel);
        const resolved = agentId ? await getAgentById(agentId) : primary;
        if (!resolved) throw new Error("agent not found");
        return { agent_id: resolved.id, agent_name: resolved.name, memory_namespace: resolved.memory_namespace };
    }

    async function sendReplyByChannel(event: Event, reply: string): Promise<void> {
        switch (event.channel) {
            case "telegram": await connector.sendReply(event.conversation.thread_id, reply); return;
            case "line": await lineConnector.sendReply(event.conversation.thread_id, reply); return;
            case "web_ui": return;
            default: throw new Error(`unsupported reply channel: ${event.channel}`);
        }
    }

    // Paths
    const approvalUiPath = path.resolve(process.cwd(), "gateway/web/approval_ui/index.html");
    const memoryBrowseRoots = [
        path.resolve(process.cwd(), "memory"),
        path.resolve(process.cwd(), "second-brain"),
    ];
    const memoryRootFile = path.resolve(process.cwd(), "MEMORY.md");
    const workflowScriptPath = path.resolve(process.cwd(), "scripts/memory_workflow.js");
    const initGatewayScriptPath = path.resolve(process.cwd(), "scripts/init_gateway_env.mjs");

    // Auth middleware
    const authCheck = createAuthMiddleware(config.gatewayApiKey, ["/healthz", "/approval-ui"]);

    // Rate limiter (P2-C)
    const rateLimiter = new RateLimiter({ maxRequests: config.rateLimitPerMinute, windowMs: 60_000 });
    const rateLimitedPaths = new Set(["/api/agent/command", "/ingress/telegram", "/ingress/line"]);

    // Router
    const router = new Router();

    // UI & health (no auth)
    router.get("/approval-ui", approvalUiRoute(approvalUiPath));
    router.get("/healthz", healthzRoute(config.maxBodyBytes));

    // All other routes
    router.get("/lifecycle", lifecycleRoute());
    router.post("/lifecycle/soul", soulRoute(config.maxBodyBytes));
    router.get("/api/agent/control", getAgentControlRoute(resolveAgentContext));
    router.post("/api/agent/control", postAgentControlRoute(resolveAgentContext, config.maxBodyBytes));
    router.get("/api/agents", listAgentsRoute(config.defaultAgentName, config.ollamaModel));
    router.post("/api/agents", createAgentRoute(config.ollamaModel, config.maxBodyBytes));
    router.patch("/api/agents/:id", patchAgentRoute(config.maxBodyBytes));
    router.get("/api/agent/communications", agentCommunicationsRoute(config.defaultAgentName, config.ollamaModel));
    router.get("/api/channels", getChannelsRoute());
    router.post("/api/channels", postChannelsRoute(config.maxBodyBytes));
    router.get("/api/inference/routes", inferenceRoutesRoute({ anythingApiKey: config.anythingApiKey, ollamaModel: config.ollamaModel, getOllamaRouteHealth, ollamaBaseUrl: config.ollamaBaseUrl }));
    router.get("/api/memory/files", memoryFilesRoute(memoryBrowseRoots));
    router.get("/api/memory/file", memoryFileRoute(memoryBrowseRoots, memoryRootFile, config.maxMemoryFileReadBytes));
    router.get("/api/memory/search", memorySearchRoute());
    router.post("/api/memory/learn", memoryLearnRoute(resolveAgentContext, config.workspace, config.maxBodyBytes));
    router.get("/api/memory/architecture", memoryArchitectureRoute());
    router.get("/api/memory/workflows", memoryWorkflowsListRoute(workflowScriptPath));
    router.post("/api/memory/workflows/run", memoryWorkflowsRunRoute(workflowScriptPath, config.maxBodyBytes));
    router.get("/api/tasks", listTasksRoute());
    router.get("/api/tasks/:id", getTaskRoute());
    router.post("/api/tasks/:id/cancel", cancelTaskRoute());
    router.delete("/api/tasks/:id", deleteTaskRoute());
    router.post("/api/tasks/run-once", runOnceRoute());
    router.get("/api/approvals", listApprovalsRoute());
    router.post("/api/approvals/:id/:decision", decideApprovalRoute(config.maxBodyBytes));
    router.post("/api/agent/command", commandRoute({ brain, ollama, workspace: config.workspace, ollamaModel: config.ollamaModel, maxBodyBytes: config.maxBodyBytes, resolveAgentContext, sendReplyByChannel }));
    router.post("/ingress/telegram", ingressTelegramRoute({ connector, brain, maxBodyBytes: config.maxBodyBytes, sendReplyByChannel }));
    router.post("/ingress/line", ingressLineRoute({ lineConnector, brain, maxBodyBytes: config.maxBodyBytes, sendReplyByChannel }));
    router.post("/api/system/init", systemInitRoute(initGatewayScriptPath));

    // Agent messaging routes (P3-B)
    router.get("/api/agent/messages", async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const agentId = url.searchParams.get("agent_id") ?? "primary";
        const onlyUnread = url.searchParams.get("all") !== "true";
        json(res, 200, { ok: true, data: listAgentMessages(agentId, onlyUnread), pending: getPendingMessageCount(agentId) });
    });
    router.post("/api/agent/messages", async (req, res) => {
        try {
            const raw = await (await import("./lib/router.js")).readBody(req, config.maxBodyBytes);
            const payload = raw ? JSON.parse(raw) : {};
            const from = String(payload.from_agent_id ?? "").trim();
            const to = String(payload.to_agent_id ?? "").trim();
            const content = String(payload.content ?? "").trim();
            if (!from || !to || !content) throw new Error("from_agent_id, to_agent_id, and content are required");
            const msg = sendAgentMessage(from, to, content, payload.metadata ?? {});
            json(res, 200, { ok: true, data: msg });
        } catch (error) {
            json(res, 400, { ok: false, error: (error as Error).message });
        }
    });
    router.post("/api/agent/messages/:messageId/read", async (req, res, params) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const agentId = url.searchParams.get("agent_id") ?? "primary";
        const ok = markMessageRead(agentId, params.messageId);
        json(res, ok ? 200 : 404, { ok });
    });

    const server = createServer(async (req, res) => {
        // Auth check (skipped for whitelisted paths)
        const authResult = authCheck(req);
        if (!authResult.ok) {
            json(res, 401, { ok: false, error: authResult.error, error_code: "AUTH_REQUIRED" });
            return;
        }

        // Rate limiting for expensive paths (P2-C)
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (rateLimitedPaths.has(pathname)) {
            const key = getRateLimitKey(req);
            const result = rateLimiter.check(key);
            if (!result.allowed) {
                json(res, 429, { ok: false, error: "rate limit exceeded", error_code: "RATE_LIMITED", retry_after_ms: result.retryAfterMs });
                return;
            }
        }

        const handled = await router.handle(req, res);
        if (!handled) {
            res.statusCode = 404;
            res.end("not found");
        }
    });

    // Graceful shutdown (P2-A)
    let isShuttingDown = false;
    async function shutdown(): Promise<void> {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log("[gateway] shutting down gracefully…");
        stopHeartbeat();
        stopJobRunner();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
            setTimeout(() => {
                console.warn("[gateway] force closing after timeout");
                resolve();
            }, 10_000);
        });
        console.log("[gateway] shutdown complete");
    }

    return { server, shutdown };
}
