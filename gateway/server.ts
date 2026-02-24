import { createServer } from "node:http";
import { TelegramConnector } from "./connectors/telegram/connector";
import { AnythingLlmClient } from "./core/anythingllm_client";
import { routeEvent } from "./core/router";

const port = Number(process.env.PORT ?? 8787);
const telegramToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
const anythingBaseUrl = process.env.ANYTHINGLLM_BASE_URL ?? "http://localhost:3001";
const anythingApiKey = process.env.ANYTHINGLLM_API_KEY ?? "";
const workspace = process.env.DEFAULT_WORKSPACE ?? "maiecho-prod";
const agent = process.env.DEFAULT_AGENT ?? "ops-agent";

if (!telegramToken) console.warn("TELEGRAM_BOT_TOKEN is empty: telegram sendReply will fail");
if (!anythingApiKey) console.warn("ANYTHINGLLM_API_KEY is empty: brain calls will fail");

const connector = new TelegramConnector({
  botToken: telegramToken,
  defaultWorkspace: workspace,
  defaultAgent: agent,
});

const brain = new AnythingLlmClient({
  baseUrl: anythingBaseUrl,
  apiKey: anythingApiKey,
});

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.statusCode = 200;
    res.end("ok");
    return;
  }

  if (req.method === "POST" && req.url === "/ingress/telegram") {
    try {
      const raw = await readBody(req);
      const event = connector.toEvent(JSON.parse(raw));
      const result = await routeEvent(event, brain);
      await connector.sendReply(event.conversation.thread_id, result.reply);

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

  res.statusCode = 404;
  res.end("not found");
});

server.listen(port, () => {
  console.log(`Gateway listening on :${port}`);
});

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
