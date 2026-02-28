import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { LineConnector } from "./connectors/line/connector";
import { TelegramConnector } from "./connectors/telegram/connector";
import { AnythingLlmClient } from "./core/anythingllm_client";
import { OllamaClient } from "./core/ollama_client";
import { getLifecycleSnapshot, parseHeartbeatInterval, startHeartbeat, updateSoul } from "./core/lifecycle";
import { executeApprovedAction, routeEvent } from "./core/router";
import { applyAgentControl, getAgentControlSnapshot } from "./core/agent_control";
import { createEvent } from "./core/event";
import { getChannelSnapshot, isChannelEnabled, markChannelActivity, setChannelEnabled } from "./core/channel_control";
import { cancelTask, deleteTask, getTaskById, listTasks } from "./core/tasks/store";
import { runQueuedJobsOnce, startJobRunner } from "./workers/job_runner";
import { decidePendingAction, getPendingActionById, listPendingActions } from "./core/approvals_store";
import { getLdbArchitectureSnapshot } from "./core/memory/ldb_architecture";
import { recordLearning, searchLearning } from "./core/memory/evolution";
import { createAgent, ensurePrimaryAgent, getAgentById, listAgents, updateAgent } from "./core/agents_registry";

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

const port = parsePositiveIntEnv("PORT", 8787);
const telegramToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const lineChannelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
const lineChannelSecret = process.env.LINE_CHANNEL_SECRET;
const anythingBaseUrl = process.env.ANYTHINGLLM_BASE_URL ?? "http://localhost:3001";
const anythingApiKey = process.env.ANYTHINGLLM_API_KEY ?? "";
const workspace = process.env.DEFAULT_WORKSPACE ?? "maiecho-prod";
const defaultAgentName = process.env.DEFAULT_AGENT ?? "ops-agent";
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const ollamaModel = process.env.OLLAMA_MODEL ?? "gpt-oss:20b";
const ollamaTimeoutMs = parsePositiveIntEnv("OLLAMA_TIMEOUT_MS", 12_000);
const upstreamRetryMaxAttempts = parsePositiveIntEnv("UPSTREAM_RETRY_MAX_ATTEMPTS", 2);
const upstreamRetryBaseDelayMs = parsePositiveIntEnv("UPSTREAM_RETRY_BASE_DELAY_MS", 200);
const heartbeatIntervalMs = parseHeartbeatInterval(process.env.HEARTBEAT_INTERVAL_MS, 10_000);
const MAX_BODY_BYTES = parsePositiveIntEnv("MAX_BODY_BYTES", 1024 * 1024);
const MAX_MEMORY_FILE_READ_BYTES = parsePositiveIntEnv("MAX_MEMORY_FILE_READ_BYTES", 256 * 1024);
const taskRunnerIntervalMs = parsePositiveIntEnv("TASK_RUNNER_INTERVAL_MS", 2_000);

if (!telegramToken) console.warn("TELEGRAM_BOT_TOKEN is empty: telegram sendReply will fail");
if (!lineChannelAccessToken) console.warn("LINE_CHANNEL_ACCESS_TOKEN is empty: line sendReply will fail");
if (!anythingApiKey) console.warn("ANYTHINGLLM_API_KEY is empty: brain calls will fail");

startHeartbeat(heartbeatIntervalMs);
startJobRunner(taskRunnerIntervalMs);

const connector = new TelegramConnector({
  botToken: telegramToken,
  webhookSecretToken: telegramWebhookSecret,
  defaultWorkspace: workspace,
  defaultAgent: defaultAgentName,
});

const lineConnector = new LineConnector({
  channelAccessToken: lineChannelAccessToken,
  channelSecret: lineChannelSecret,
  defaultWorkspace: workspace,
  defaultAgent: defaultAgentName,
});

const brain = new AnythingLlmClient({
  baseUrl: anythingBaseUrl,
  apiKey: anythingApiKey,
  maxRetries: Math.max(0, upstreamRetryMaxAttempts - 1),
  retryBaseDelayMs: upstreamRetryBaseDelayMs,
});

const ollama = new OllamaClient({
  baseUrl: ollamaBaseUrl,
  model: ollamaModel,
  timeoutMs: ollamaTimeoutMs,
  maxRetries: Math.max(0, upstreamRetryMaxAttempts - 1),
  retryBaseDelayMs: upstreamRetryBaseDelayMs,
});


const approvalUiPath = path.resolve(process.cwd(), "gateway/web/approval_ui/index.html");
const memoryBrowseRoots = [
  path.resolve(process.cwd(), "memory"),
  path.resolve(process.cwd(), "second-brain"),
];
const memoryRootFile = path.resolve(process.cwd(), "MEMORY.md");
const execFileAsync = promisify(execFile);
const workflowScriptPath = path.resolve(process.cwd(), "scripts/memory_workflow.js");
const initGatewayScriptPath = path.resolve(process.cwd(), "scripts/init_gateway_env.mjs");

async function resolveAgentContext(agentId?: string): Promise<{ agent_id: string; agent_name: string; memory_namespace: string }> {
  const primary = await ensurePrimaryAgent(defaultAgentName, ollamaModel);
  const resolved = agentId ? await getAgentById(agentId) : primary;
  if (!resolved) throw new Error("agent not found");
  return { agent_id: resolved.id, agent_name: resolved.name, memory_namespace: resolved.memory_namespace };
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/approval-ui") {
    try {
      const html = await readFile(approvalUiPath, "utf8");
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(html);
      return;
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  if (req.method === "GET" && req.url?.startsWith("/api/agent/control")) {
    try {
      const requestUrl = new URL(req.url ?? "/", "http://localhost");
      const agentId = String(requestUrl.searchParams.get("agent_id") ?? "").trim() || undefined;
      const context = await resolveAgentContext(agentId);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data: getAgentControlSnapshot(context.agent_id), agent: context }));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  if (req.method === "POST" && req.url === "/api/agent/control") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const action = payload.action as "start" | "pause" | "resume" | "stop";
      const context = await resolveAgentContext(typeof payload.agent_id === "string" ? payload.agent_id : undefined);
      const data = applyAgentControl(action, context.agent_id);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data, agent: context }));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }



  if (req.method === "GET" && req.url === "/api/agents") {
    try {
      await ensurePrimaryAgent(defaultAgentName, ollamaModel);
      const data = await listAgents();
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data }));
      return;
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  if (req.method === "POST" && req.url === "/api/agents") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const name = String(payload.name ?? "").trim();
      const model = String(payload.model ?? ollamaModel).trim();
      const soul = String(payload.soul ?? "operations").trim();
      const communicationMode = payload.communication_mode === "direct" ? "direct" : "hub_and_spoke";
      if (!name) throw new Error("name is required");
      const created = await createAgent({ name, model, soul, communication_mode: communicationMode });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data: created }));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  if (req.method === "PATCH" && req.url?.startsWith("/api/agents/")) {
    try {
      const agentId = decodeURIComponent((req.url ?? "").split("/").filter(Boolean)[2] ?? "");
      if (!agentId) throw new Error("agent id is required");
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const updated = await updateAgent(agentId, payload);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data: updated }));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  if (req.method === "GET" && req.url?.startsWith("/api/agent/communications")) {
    try {
      await ensurePrimaryAgent(defaultAgentName, ollamaModel);
      const data = await listAgents();
      const links = data.flatMap((item) => data
        .filter((peer) => peer.id !== item.id)
        .filter((peer) => item.communication_mode === "direct" || item.is_primary || peer.is_primary)
        .map((peer) => ({ from: item.id, to: peer.id, mode: item.communication_mode })));
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data: links }));
      return;
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  if (req.method === "GET" && req.url === "/api/inference/routes") {
    const ollamaHealth = await getOllamaRouteHealth(ollamaBaseUrl);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      ok: true,
      data: {
        default_path: "anythingllm",
        routes: {
          anythingllm: {
            enabled: Boolean(anythingApiKey),
            model: null,
            reason: anythingApiKey ? null : "ANYTHINGLLM_API_KEY is empty",
          },
          ollama: {
            enabled: ollamaHealth.enabled,
            model: ollamaModel,
            reason: ollamaHealth.reason,
          },
        },
      },
    }));
    return;
  }


  if (req.method === "GET" && req.url === "/api/memory/files") {
    try {
      const files = await listMemoryFiles();
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data: files }));
      return;
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "讀取記憶檔案清單失敗" }));
      return;
    }
  }

  if (req.method === "GET" && req.url?.startsWith("/api/memory/file")) {
    try {
      const requestUrl = new URL(req.url ?? "/", "http://localhost");
      const target = String(requestUrl.searchParams.get("path") ?? "").trim();
      if (!target) throw new Error("path is required");
      const resolvedPath = resolveMemoryPath(target);
      const content = await readFile(resolvedPath, "utf8");
      const truncated = content.length > MAX_MEMORY_FILE_READ_BYTES;
      const safeContent = truncated ? content.slice(0, MAX_MEMORY_FILE_READ_BYTES) : content;

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        ok: true,
        data: {
          path: toRepoRelativePath(resolvedPath),
          content: safeContent,
          truncated,
        },
      }));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      const publicError = buildPublicError(error, "讀取記憶檔案失敗", "MEMORY_FILE_READ_FAILED");
      res.end(JSON.stringify({ ok: false, error: publicError.message, error_code: publicError.code }));
      return;
    }
  }


  if (req.method === "POST" && req.url === "/api/memory/workflows/run") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const job = String(payload.job ?? "").trim();
      const date = String(payload.date ?? "").trim();
      const dryRun = Boolean(payload.dryRun);
      if (!["microsync", "daily-wrapup", "weekly-compound"].includes(job)) {
        throw new Error("invalid workflow job");
      }

      const args = [workflowScriptPath, "run", job];
      if (date) args.push("--date", date);
      if (dryRun) args.push("--dry-run");

      const { stdout } = await execFileAsync(process.execPath, args, { cwd: process.cwd(), timeout: 20_000, maxBuffer: 1024 * 1024 });
      const parsed = stdout ? JSON.parse(stdout) : { ok: false, error: "empty workflow output" };
      if (!parsed.ok) {
        throw new Error(parsed.error || "workflow execution failed");
      }

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data: parsed.data }));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      const publicError = buildPublicError(error, "固定工作流程執行失敗", "MEMORY_WORKFLOW_FAILED");
      res.end(JSON.stringify({ ok: false, error: publicError.message, error_code: publicError.code }));
      return;
    }
  }

  if (req.method === "GET" && req.url === "/api/memory/workflows") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      ok: true,
      data: {
        jobs: ["microsync", "daily-wrapup", "weekly-compound"],
        script: toRepoRelativePath(workflowScriptPath),
      },
    }));
    return;
  }


  if (req.method === "POST" && req.url === "/api/memory/learn") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const context = await resolveAgentContext(typeof payload.agent_id === "string" ? payload.agent_id : undefined);
      const scope = String(payload.scope ?? `${workspace}:${context.agent_name}`).trim();
      const kind = String(payload.kind ?? "methodology").trim() as "pitfall" | "methodology" | "decision";
      const title = String(payload.title ?? "manual learning").trim();
      const summary = String(payload.summary ?? "").trim();
      const details = (payload.details && typeof payload.details === "object") ? payload.details : {};
      if (!summary) throw new Error("summary is required");
      if (!["pitfall", "methodology", "decision"].includes(kind)) throw new Error("invalid learning kind");

      const result = await recordLearning({ scope, kind, title, summary, details, memory_namespace: context.memory_namespace });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data: result }));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      const publicError = buildPublicError(error, "記憶寫入失敗", "MEMORY_WRITE_FAILED");
      res.end(JSON.stringify({ ok: false, error: publicError.message, error_code: publicError.code }));
      return;
    }
  }

  if (req.method === "GET" && req.url?.startsWith("/api/memory/search")) {
    try {
      const requestUrl = new URL(req.url ?? "/", "http://localhost");
      const query = String(requestUrl.searchParams.get("q") ?? "").trim();
      const limit = Number(requestUrl.searchParams.get("limit") ?? 20);
      if (!query) throw new Error("q is required");
      const result = await searchLearning(query, limit);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data: result.items, warning: result.warning }));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      const publicError = buildPublicError(error, "LanceDB 搜尋失敗", "MEMORY_SEARCH_FAILED");
      res.end(JSON.stringify({ ok: false, error: publicError.message, error_code: publicError.code }));
      return;
    }
  }

  if (req.method === "POST" && req.url === "/api/system/init") {
    try {
      const { stdout } = await execFileAsync(process.execPath, [initGatewayScriptPath], { cwd: process.cwd(), timeout: 120_000, maxBuffer: 1024 * 1024 * 4 });
      const parsed = stdout ? JSON.parse(stdout) : { ok: false, error: "empty init output" };
      if (!parsed.ok) throw new Error(parsed.error || "init failed");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(parsed));
      return;
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      const publicError = buildPublicError(error, "初始化失敗", "SYSTEM_INIT_FAILED");
      res.end(JSON.stringify({ ok: false, error: publicError.message, error_code: publicError.code }));
      return;
    }
  }

  if (req.method === "GET" && req.url === "/api/channels") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, data: getChannelSnapshot() }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/channels") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const channel = payload.channel as "telegram" | "line" | "web_ui";
      const enabled = payload.enabled;
      if (!["telegram", "line", "web_ui"].includes(channel)) throw new Error("invalid channel");
      if (typeof enabled !== "boolean") throw new Error("enabled must be boolean");

      const data = setChannelEnabled(channel, enabled);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data }));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  if (req.method === "GET") {
    try {
      const requestUrl = new URL(req.url ?? "/", "http://localhost");
      if (requestUrl.pathname === "/api/tasks") {
        const statusParam = requestUrl.searchParams.get("status");
        const limitParam = requestUrl.searchParams.get("limit");
        const status = statusParam ?? undefined;
        const limit = limitParam ? Number(limitParam) : undefined;
        const agentId = requestUrl.searchParams.get("agent_id") ?? undefined;
        const tasks = await listTasks({ status: status as import("./core/tasks/store").TaskStatus | undefined, limit, agent_id: agentId ?? undefined });
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, data: tasks }));
        return;
      }
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  if (req.method === "POST" && req.url === "/api/tasks/run-once") {
    try {
      await runQueuedJobsOnce();
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }


  if (req.method === "GET" && req.url === "/api/memory/architecture") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, data: getLdbArchitectureSnapshot() }));
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/api/approvals")) {
    try {
      const url = new URL(req.url, `http://localhost:${port}`);
      const status = url.searchParams.get("status") ?? undefined;
      const type = url.searchParams.get("type") ?? undefined;
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const data = await listPendingActions({
        status: status as "pending" | "approved" | "rejected" | "executed" | "expired" | undefined,
        type: type as "approval" | "confirm" | undefined,
        limit,
      });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data }));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  if (req.method === "POST" && /^\/api\/approvals\/[^/]+\/(approve|reject)$/.test(req.url ?? "")) {
    try {
      const match = (req.url ?? "").match(/^\/api\/approvals\/([^/]+)\/(approve|reject)$/);
      if (!match) throw new Error("invalid approval route");
      const actionId = decodeURIComponent(match[1]);
      const decision = match[2] as "approve" | "reject";
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const actorId = String(payload.actor_id ?? "approval-ui").trim();
      const reason = typeof payload.reason === "string" ? payload.reason : undefined;

      const decided = await decidePendingAction(actionId, actorId, decision, reason);
      if (decision === "reject") {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, data: decided }));
        return;
      }

      const fresh = await getPendingActionById(actionId);
      if (!fresh) throw new Error("pending action not found after approval");

      if (fresh.requires_confirm_token) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          ok: true,
          data: fresh,
          next_step: "confirm_token_required",
          confirm_token: fresh.confirm_token,
        }));
        return;
      }

      const execution = await executeApprovedAction(fresh);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data: decided, execution }));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  if (req.method === "POST" && req.url === "/api/agent/command") {
    try {
      if (!isChannelEnabled("web_ui")) {
        res.statusCode = 503;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, error: "web_ui channel is disabled" }));
        return;
      }
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const text = String(payload.text ?? "").trim();
      const path = String(payload.path ?? "anythingllm").trim();
      const context = await resolveAgentContext(typeof payload.agent_id === "string" ? payload.agent_id : undefined);
      const confirmToken = typeof payload.confirm_token === "string" ? payload.confirm_token.trim() : "";
      if (!text && !confirmToken) throw new Error("text or confirm_token is required");
      if (!["anythingllm", "ollama"].includes(path)) throw new Error("path must be anythingllm or ollama");

      markChannelActivity("web_ui");

      const event = createEvent({
        channel: "web_ui",
        sender: {
          id: "approval-ui",
          display: "Approval UI",
          roles: ["operator"],
        },
        conversation: {
          thread_id: `approval-ui:${Date.now()}`,
        },
        workspace,
        agent: context.agent_name,
        message: {
          text,
          attachments: [],
        },
      });

      let reply = "";
      if (path === "ollama") {
        reply = await ollama.generate(text);
      } else {
        const result = await routeEvent(event, brain, { confirm_token: confirmToken || undefined });
        reply = result.reply;
      }
      await sendReplyByChannel(event, reply);

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, trace_id: event.trace_id, reply, path, model: path === "ollama" ? ollamaModel : undefined, agent: context }));
      return;
    } catch (error) {
      console.error("/api/agent/command failed", error);
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      const publicError = buildPublicError(error, "指令執行失敗，請檢查路徑設定或服務狀態", "AGENT_COMMAND_FAILED");
      res.end(JSON.stringify({ ok: false, error: publicError.message, error_code: publicError.code }));
      return;
    }
  }

  if (req.method === "GET" && req.url === "/healthz") {
    const lifecycle = getLifecycleSnapshot();
    res.statusCode = lifecycle.status === "ok" ? 200 : 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: lifecycle.status === "ok", status: lifecycle.status, heartbeat_age_ms: lifecycle.heartbeat.age_ms }));
    return;
  }

  if (req.method === "GET" && req.url === "/lifecycle") {
    const lifecycle = getLifecycleSnapshot();
    res.statusCode = lifecycle.status === "ok" ? 200 : 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(lifecycle));
    return;
  }


  if (req.method === "POST" && req.url === "/lifecycle/soul") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const soul = updateSoul(payload as { role?: string; node_env?: string });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, soul }));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  if (req.method === "POST" && req.url === "/ingress/telegram") {
    try {
      if (!isChannelEnabled("telegram")) {
        res.statusCode = 503;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, error: "telegram channel is disabled" }));
        return;
      }
      const secretHeader = req.headers["x-telegram-bot-api-secret-token"];
      const secretValue = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;
      if (!connector.verifyWebhookSecretToken(secretValue)) {
        res.statusCode = 401;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, error: "invalid telegram webhook secret token" }));
        return;
      }

      const raw = await readBody(req);
      markChannelActivity("telegram");

      const event = connector.toEvent(JSON.parse(raw));
      const result = await routeEvent(event, brain);
      await sendReplyByChannel(event, result.reply);

      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, trace_id: event.trace_id }));
      return;
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  if (req.method === "POST" && req.url === "/ingress/line") {
    try {
      if (!isChannelEnabled("line")) {
        res.statusCode = 503;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, error: "line channel is disabled" }));
        return;
      }
      const raw = await readBody(req);
      const signature = req.headers["x-line-signature"];
      const signatureValue = Array.isArray(signature) ? signature[0] : signature;
      if (!lineConnector.verifySignature(raw, signatureValue)) {
        res.statusCode = 401;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, error: "invalid line signature" }));
        return;
      }

      markChannelActivity("line");

      const event = lineConnector.toEvent(JSON.parse(raw));
      const result = await routeEvent(event, brain);
      await sendReplyByChannel(event, result.reply);

      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, trace_id: event.trace_id }));
      return;
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  if (req.url?.startsWith("/api/tasks/")) {
    const taskId = req.url.split("/").filter(Boolean)[2];
    if (!taskId) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "task id is required" }));
      return;
    }

    try {
      if (req.method === "GET") {
        const task = await getTaskById(taskId);
        if (!task) {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "task not found" }));
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, data: task }));
        return;
      }

      if (req.method === "POST" && req.url.endsWith("/cancel")) {
        const cancelled = await cancelTask(taskId);
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, data: cancelled }));
        return;
      }

      if (req.method === "DELETE") {
        const deleted = await deleteTask(taskId);
        res.statusCode = deleted ? 200 : 404;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: deleted }));
        return;
      }
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      return;
    }
  }

  res.statusCode = 404;
  res.end("not found");
});

server.listen(port, () => {
  console.log(`Gateway listening on :${port}`);
});


async function sendReplyByChannel(event: import("./core/event").Event, reply: string): Promise<void> {
  switch (event.channel) {
    case "telegram":
      await connector.sendReply(event.conversation.thread_id, reply);
      return;
    case "line":
      await lineConnector.sendReply(event.conversation.thread_id, reply);
      return;
    case "web_ui":
      return;
    default:
      throw new Error(`unsupported reply channel: ${event.channel}`);
  }
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on("data", (chunk) => {
      const data = Buffer.from(chunk);
      totalBytes += data.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error(`request body too large (max ${MAX_BODY_BYTES} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(data);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}


async function getOllamaRouteHealth(baseUrl: string): Promise<{ enabled: boolean; reason: string | null }> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    if (!response.ok) {
      return { enabled: false, reason: `Ollama health check failed (${response.status})` };
    }
    return { enabled: true, reason: null };
  } catch (error) {
    const message = (error as Error).message || "unknown error";
    return { enabled: false, reason: `Ollama unreachable: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}


interface PublicError {
  message: string;
  code: string;
}

function buildPublicError(error: unknown, fallbackMessage: string, fallbackCode: string): PublicError {
  const message = (error as Error)?.message ?? fallbackMessage;

  if (/request body too large/i.test(message)) {
    return { message, code: "REQUEST_BODY_TOO_LARGE" };
  }
  if (/text is required|path is required|path must be anythingllm or ollama|unsupported memory path|invalid workflow job/i.test(message)) {
    return { message, code: "INVALID_INPUT" };
  }
  if (/file not found/i.test(message)) {
    return { message, code: "NOT_FOUND" };
  }
  if (/job locked/i.test(message)) {
    return { message, code: "JOB_LOCKED" };
  }
  if (/AnythingLLM connection failed|Ollama connection failed|Ollama unreachable|fetch failed/i.test(message)) {
    return { message: fallbackMessage, code: "UPSTREAM_UNAVAILABLE" };
  }

  return { message: fallbackMessage, code: fallbackCode };
}


async function listMemoryFiles(): Promise<Array<{ path: string; size: number; updated_at: string }>> {
  const files: Array<{ path: string; size: number; updated_at: string }> = [];

  try {
    const rootStat = await stat(memoryRootFile);
    if (rootStat.isFile()) {
      files.push({ path: toRepoRelativePath(memoryRootFile), size: rootStat.size, updated_at: rootStat.mtime.toISOString() });
    }
  } catch {
    // ignore missing MEMORY.md
  }

  for (const root of memoryBrowseRoots) {
    await walkMemoryDir(root, files);
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function walkMemoryDir(dirPath: string, files: Array<{ path: string; size: number; updated_at: string }>): Promise<void> {
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walkMemoryDir(fullPath, files);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const fileStat = await stat(fullPath);
    files.push({ path: toRepoRelativePath(fullPath), size: fileStat.size, updated_at: fileStat.mtime.toISOString() });
  }
}

function resolveMemoryPath(relativePath: string): string {
  const normalized = relativePath.replace(/^\/+/, "");
  const fullPath = path.resolve(process.cwd(), normalized);

  const inRootFile = fullPath === memoryRootFile;
  const inMemoryRoots = memoryBrowseRoots.some((root) => fullPath === root || fullPath.startsWith(`${root}${path.sep}`));
  if (!inRootFile && !inMemoryRoots) {
    throw new Error("unsupported memory path");
  }
  if (!fullPath.endsWith(".md") && fullPath !== memoryRootFile) {
    throw new Error("unsupported memory path");
  }
  return fullPath;
}

function toRepoRelativePath(fullPath: string): string {
  return path.relative(process.cwd(), fullPath).replace(/\\/g, "/");
}
