#!/usr/bin/env node

const DEFAULT_BASE_URL = process.env.GATEWAY_BASE_URL || "http://localhost:8787";
const DEFAULT_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 4000);

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--base-url") {
      args.baseUrl = String(argv[i + 1] || "").trim() || DEFAULT_BASE_URL;
      i += 1;
      continue;
    }
    if (token === "--timeout-ms") {
      const next = Number(argv[i + 1]);
      args.timeoutMs = Number.isFinite(next) && next > 0 ? Math.floor(next) : DEFAULT_TIMEOUT_MS;
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
    }
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function requestJson(baseUrl, path, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(path, baseUrl), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`invalid JSON for ${path}: ${text.slice(0, 180)}`);
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

const checks = [
  {
    name: "healthz contract",
    path: "/healthz",
    validate: ({ status, body }) => {
      assert([200, 503].includes(status), `unexpected status=${status}`);
      assert(typeof body?.ok === "boolean", "missing boolean ok");
      assert(typeof body?.status === "string", "missing string status");
      assert(typeof body?.heartbeat_age_ms === "number", "missing number heartbeat_age_ms");
    },
  },
  {
    name: "lifecycle contract",
    path: "/lifecycle",
    validate: ({ status, body }) => {
      assert([200, 503].includes(status), `unexpected status=${status}`);
      assert(typeof body?.status === "string", "missing status");
      assert(typeof body?.heartbeat?.age_ms === "number", "missing heartbeat.age_ms");
    },
  },
  {
    name: "channels contract",
    path: "/api/channels",
    validate: ({ status, body }) => {
      assert(status === 200, `unexpected status=${status}`);
      assert(body?.ok === true, "ok must be true");
      assert(typeof body?.data === "object" && body?.data, "missing data object");
    },
  },
  {
    name: "inference routes contract",
    path: "/api/inference/routes",
    validate: ({ status, body }) => {
      assert(status === 200, `unexpected status=${status}`);
      assert(body?.ok === true, "ok must be true");
      assert(typeof body?.data?.default_path === "string", "missing data.default_path");
      assert(typeof body?.data?.routes === "object" && body?.data?.routes, "missing data.routes");
    },
  },
  {
    name: "tasks list contract",
    path: "/api/tasks?limit=1",
    validate: ({ status, body }) => {
      assert(status === 200, `unexpected status=${status}`);
      assert(body?.ok === true, "ok must be true");
      assert(Array.isArray(body?.data), "data must be array");
    },
  },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/smoke_gateway_contract.mjs [--base-url http://localhost:8787] [--timeout-ms 4000]");
    return;
  }

  const results = [];
  for (const check of checks) {
    const started = Date.now();
    try {
      const payload = await requestJson(args.baseUrl, check.path, args.timeoutMs);
      check.validate(payload);
      results.push({ name: check.name, ok: true, ms: Date.now() - started, detail: `${payload.status} ${check.path}` });
    } catch (error) {
      results.push({ name: check.name, ok: false, ms: Date.now() - started, detail: (error).message });
    }
  }

  console.log(`Gateway contract smoke test @ ${args.baseUrl}`);
  for (const item of results) {
    const icon = item.ok ? "✅" : "❌";
    console.log(`${icon} ${item.name} (${item.ms}ms) - ${item.detail}`);
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
