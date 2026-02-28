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
  try {
    const checkCmd = process.platform === "win32" ? "where" : "command";
    const args = process.platform === "win32" ? [cmd] : ["-v", cmd];
    const r = spawnSync(checkCmd, args, { encoding: "utf8" });
    return r.status === 0;
  } catch {
    return false;
  }
}

function main() {
  const report = [];
  const nodeCmd = "node";
  const npmCmd = "npm";
  let pythonCmd = "python3";

  if (!exists(nodeCmd)) throw new Error("node is required");
  if (!exists(npmCmd)) throw new Error("npm is required");

  if (!exists(pythonCmd)) {
    if (exists("python")) {
      pythonCmd = "python";
    } else {
      throw new Error("python3 or python is required");
    }
  }

  report.push({ step: "node", ok: true, version: run(nodeCmd, ["-v"]).output });
  report.push({ step: "npm", ok: true, version: run(npmCmd, ["-v"]).output });
  report.push({ step: "python", ok: true, version: run(pythonCmd, ["--version"]).output, cmd: pythonCmd });

  const pip = run(pythonCmd, ["-m", "pip", "--version"], true);
  if (!pip.ok) throw new Error(`${pythonCmd} -m pip is required`);
  report.push({ step: "pip", ok: true, version: pip.output });

  const install = run(pythonCmd, ["-m", "pip", "install", "--user", "lancedb", "pyarrow"], true);
  report.push({ step: "pip-install-lancedb", ok: install.ok, output: install.output.slice(0, 2000) });

  const importCheck = run(pythonCmd, ["-c", "import lancedb;print('ok')"], true);
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
