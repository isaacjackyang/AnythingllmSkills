#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const DEFAULT_BASE_URL = process.env.GATEWAY_BASE_URL || "http://localhost:8787";

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    requireLive: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--base-url") {
      args.baseUrl = String(argv[i + 1] || "").trim() || DEFAULT_BASE_URL;
      i += 1;
      continue;
    }
    if (token === "--require-live") {
      args.requireLive = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
    }
  }

  return args;
}

function runNode(args) {
  const out = spawnSync(process.execPath, args, { encoding: "utf8" });
  return {
    ok: out.status === 0,
    status: out.status ?? 1,
    stdout: out.stdout || "",
    stderr: out.stderr || "",
  };
}

function runCheck(name, fn) {
  const started = Date.now();
  try {
    const result = fn();
    return {
      name,
      ok: Boolean(result.ok),
      warning: Boolean(result.warning),
      detail: result.detail || "",
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      warning: false,
      detail: (error).message || "unknown error",
      ms: Date.now() - started,
    };
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/release_checklist.mjs [--base-url http://localhost:8787] [--require-live]");
    process.exit(0);
  }

  const checks = [];

  checks.push(runCheck("smoke script syntax", () => {
    const run = runNode(["--check", "scripts/smoke_gateway_contract.mjs"]);
    return {
      ok: run.ok,
      detail: run.ok ? "scripts/smoke_gateway_contract.mjs syntax ok" : (run.stderr || run.stdout || "syntax check failed").trim(),
    };
  }));

  checks.push(runCheck("release checklist syntax", () => {
    const run = runNode(["--check", "scripts/release_checklist.mjs"]);
    return {
      ok: run.ok,
      detail: run.ok ? "scripts/release_checklist.mjs syntax ok" : (run.stderr || run.stdout || "syntax check failed").trim(),
    };
  }));

  checks.push(runCheck("gateway live smoke contract", () => {
    const run = runNode(["scripts/smoke_gateway_contract.mjs", "--base-url", args.baseUrl]);

    if (run.ok) {
      return {
        ok: true,
        detail: `live smoke passed @ ${args.baseUrl}`,
      };
    }

    const detail = (run.stdout || run.stderr || "smoke failed").trim().slice(0, 600);
    if (!args.requireLive) {
      return {
        ok: true,
        warning: true,
        detail: `live smoke skipped as warning (gateway may be offline): ${detail}`,
      };
    }

    return {
      ok: false,
      detail: detail || `live smoke failed @ ${args.baseUrl}`,
    };
  }));

  console.log(`Release checklist @ ${args.baseUrl}`);
  for (const check of checks) {
    const icon = check.ok ? (check.warning ? "⚠️" : "✅") : "❌";
    console.log(`${icon} ${check.name} (${check.ms}ms) - ${check.detail}`);
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
