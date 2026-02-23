const { spawn } = require('child_process');
const fs = require('fs');
const { ok, error } = require('../_shared/response');

const ALLOWLIST = {
  git: {
    argPatterns: [/^[a-zA-Z0-9._/:=@+-]+$/],
    blockedSubcommands: ['credential', 'config', 'daemon']
  },
  node: { argPatterns: [/^[a-zA-Z0-9._/:=@+-]+$/] },
  python: { argPatterns: [/^[a-zA-Z0-9._/:=@+-]+$/] },
  npm: { argPatterns: [/^[a-zA-Z0-9._/:=@+-]+$/] },
  pnpm: { argPatterns: [/^[a-zA-Z0-9._/:=@+-]+$/] }
};

const BLOCKED_TOKENS = /[;&|`><$(){}!]/;

function validateCommand(command, args) {
  const policy = ALLOWLIST[command];
  if (!policy) return `Command is not allowlisted: ${command}`;

  if (args.length > 0 && policy.blockedSubcommands?.includes(args[0])) {
    return `Subcommand is blocked: ${args[0]}`;
  }

  for (const arg of args) {
    if (!arg) return 'Empty argument is not allowed';
    if (BLOCKED_TOKENS.test(arg)) return `Disallowed token in arg: ${arg}`;
    if (!policy.argPatterns.some((pattern) => pattern.test(arg))) {
      return `Arg rejected by policy: ${arg}`;
    }
  }

  return null;
}

module.exports = async function execute(params = {}) {
  const action = String(params.action || '').trim();
  if (action !== 'run') return error(action || 'unknown', 'Unsupported action. Only run is available.');

  const command = String(params.command || '').trim().toLowerCase();
  const args = Array.isArray(params.args) ? params.args.map((x) => String(x || '').trim()) : [];
  const cwd = params.cwd ? String(params.cwd).trim() : process.cwd();
  const timeoutMs = Math.max(1000, Math.min(Number(params.timeoutMs || 15000), 120000));

  if (!command) return error(action, 'Missing required parameter: command');
  if (!fs.existsSync(cwd)) return error(action, `cwd does not exist: ${cwd}`);

  const validationError = validateCommand(command, args);
  if (validationError) return error(action, validationError, { command, args });

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (spawnError) => {
      clearTimeout(timer);
      resolve(error(action, 'Process spawn failed.', { command, args, cwd, reason: spawnError.message }));
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      const resultData = {
        command,
        args,
        cwd,
        exitCode,
        timedOut,
        stdout: stdout.slice(0, 12000),
        stderr: stderr.slice(0, 12000)
      };

      if (timedOut) return resolve(error(action, 'Command timed out.', { ...resultData, timeoutMs }));
      if (exitCode !== 0) return resolve(error(action, 'Command failed.', resultData));

      resolve(ok(action, resultData, { durationMs }));
    });
  });
};
