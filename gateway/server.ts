import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LineConnector } from "./connectors/line/connector";
import { TelegramConnector } from "./connectors/telegram/connector";
import { AnythingLlmClient } from "./core/anythingllm_client";
import { getLifecycleSnapshot, parseHeartbeatInterval, startHeartbeat, updateSoul } from "./core/lifecycle";
import { routeEvent } from "./core/router";
import { applyAgentControl, getAgentControlSnapshot } from "./core/agent_control";
import { createEvent } from "./core/event";
import { getChannelSnapshot, isChannelEnabled, markChannelActivity, setChannelEnabled } from "./core/channel_control";
import { cancelTask, deleteTask, getTaskById, listTasks } from "./core/tasks/store";
import { runQueuedJobsOnce, startJobRunner } from "./workers/job_runner";

const port = Number(process.env.PORT ?? 8787);
const telegramToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const lineChannelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
const lineChannelSecret = process.env.LINE_CHANNEL_SECRET;
const anythingBaseUrl = process.env.ANYTHINGLLM_BASE_URL ?? "http://localhost:3001";
const anythingApiKey = process.env.ANYTHINGLLM_API_KEY ?? "";
const workspace = process.env.DEFAULT_WORKSPACE ?? "maiecho-prod";
const agent = process.env.DEFAULT_AGENT ?? "ops-agent";
const heartbeatIntervalMs = parseHeartbeatInterval(process.env.HEARTBEAT_INTERVAL_MS, 10_000);

if (!telegramToken) console.warn("TELEGRAM_BOT_TOKEN is empty: telegram sendReply will fail");
if (!lineChannelAccessToken) console.warn("LINE_CHANNEL_ACCESS_TOKEN is empty: line sendReply will fail");
if (!anythingApiKey) console.warn("ANYTHINGLLM_API_KEY is empty: brain calls will fail");

startHeartbeat(heartbeatIntervalMs);
startJobRunner(Number(process.env.TASK_RUNNER_INTERVAL_MS ?? 2000));

const connector = new TelegramConnector({
  botToken: telegramToken,
  webhookSecretToken: telegramWebhookSecret,
  defaultWorkspace: workspace,
  defaultAgent: agent,
});

const lineConnector = new LineConnector({
  channelAccessToken: lineChannelAccessToken,
  channelSecret: lineChannelSecret,
  defaultWorkspace: workspace,
  defaultAgent: agent,
});

const brain = new AnythingLlmClient({
  baseUrl: anythingBaseUrl,
  apiKey: anythingApiKey,
});


const approvalUiPath = path.resolve(process.cwd(), "gateway/web/approval_ui/index.html");

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

  if (req.method === "GET" && req.url === "/api/agent/control") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, data: getAgentControlSnapshot() }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/agent/control") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const action = payload.action as "start" | "pause" | "resume" | "stop";
      const data = applyAgentControl(action);
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
        const tasks = await listTasks({ status: status as import("./core/tasks/store").TaskStatus | undefined, limit });
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
      if (!text) throw new Error("text is required");

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
        agent,
        message: {
          text,
          attachments: [],
        },
      });

      const result = await routeEvent(event, brain);
      await sendReplyByChannel(event, result.reply);

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, trace_id: event.trace_id, reply: result.reply }));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
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
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
