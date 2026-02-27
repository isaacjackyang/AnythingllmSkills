#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run(cmd, args, optional = false) {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  if (result.status !== 0) {
    if (optional) return { ok: false, output: result.stderr || result.stdout || "" };
    throw new Error(`${cmd} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return { ok: true, output: result.stdout.trim() };
}

function exists(cmd) {
  const r = spawnSync("bash", ["-lc", `command -v ${cmd}`], { encoding: "utf8" });
  return r.status === 0;
}

function main() {
  const report = [];
  if (!exists("node")) throw new Error("node is required");
  if (!exists("npm")) throw new Error("npm is required");
  if (!exists("python3")) throw new Error("python3 is required");

  report.push({ step: "node", ok: true, version: run("node", ["-v"]).output });
  report.push({ step: "npm", ok: true, version: run("npm", ["-v"]).output });
  report.push({ step: "python3", ok: true, version: run("python3", ["--version"]).output });

  const pip = run("python3", ["-m", "pip", "--version"], true);
  if (!pip.ok) throw new Error("python3 -m pip is required");
  report.push({ step: "pip", ok: true, version: pip.output });

  const install = run("python3", ["-m", "pip", "install", "--user", "lancedb", "pyarrow"], true);
  report.push({ step: "pip-install-lancedb", ok: install.ok, output: install.output.slice(0, 2000) });

  const importCheck = run("python3", ["-c", "import lancedb;print('ok')"], true);
  report.push({ step: "import-lancedb", ok: importCheck.ok, output: importCheck.output });

  const overallOk = report.every((r) => r.ok);
  console.log(JSON.stringify({ ok: overallOk, report }, null, 2));
  if (!overallOk) process.exit(2);
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
