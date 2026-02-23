const { spawn } = require('child_process');
const fs = require('fs');

const ALLOWLIST = {
  git: {
    args: [/^[a-zA-Z0-9._\/-]+$/, /^-{1,2}[a-zA-Z0-9._-]+$/, /^@[a-zA-Z0-9._\/-]+$/],
    blockedSubcommands: ['credential', 'config', 'daemon']
  },
  node: {
    args: [/^[a-zA-Z0-9._\/-]+$/, /^-{1,2}[a-zA-Z0-9._-]+$/]
  },
  python: {
    args: [/^[a-zA-Z0-9._\/-]+$/, /^-{1,2}[a-zA-Z0-9._-]+$/]
  },
  npm: {
    args: [/^[a-zA-Z0-9._\/-]+$/, /^-{1,2}[a-zA-Z0-9._-]+$/]
  },
  pnpm: {
    args: [/^[a-zA-Z0-9._\/-]+$/, /^-{1,2}[a-zA-Z0-9._-]+$/]
  }
};

const BLOCKED_TOKENS = /[;&|`><]/;

function isAllowedArg(program, arg) {
  const rules = ALLOWLIST[program]?.args || [];
  return rules.some((rule) => rule.test(arg));
}

function validate(program, args) {
  if (!ALLOWLIST[program]) {
    return `Program is not allowlisted: ${program}`;
  }

  for (const arg of args) {
    if (BLOCKED_TOKENS.test(arg)) {
      return `Disallowed shell token in arg: ${arg}`;
    }

    if (!isAllowedArg(program, arg)) {
      return `Arg rejected by allowlist policy: ${arg}`;
    }
  }

  if (args.length > 0 && ALLOWLIST[program].blockedSubcommands?.includes(args[0])) {
    return `Subcommand is blocked: ${args[0]}`;
  }

  return null;
}

module.exports = async function execute(params = {}) {
  const program = String(params.program || '').trim().toLowerCase();
  const args = Array.isArray(params.args) ? params.args.map((x) => String(x || '')) : [];
  const cwd = params.cwd ? String(params.cwd).trim() : process.cwd();
  const timeoutMs = Math.max(1000, Math.min(Number(params.timeoutMs || 15000), 120000));

  if (!program) {
    return { ok: false, message: 'Missing required parameter: program' };
  }

  if (!fs.existsSync(cwd)) {
    return { ok: false, message: `cwd does not exist: ${cwd}` };
  }

  const validationError = validate(program, args);
  if (validationError) {
    return { ok: false, message: validationError, program, args };
  }

  return new Promise((resolve) => {
    const child = spawn(program, args, {
      cwd,
      shell: false,
      windowsHide: true
    });

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

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, program, args, cwd, timedOut, message: error.message, stdout, stderr });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        program,
        args,
        cwd,
        timedOut,
        exitCode: code,
        stdout: stdout.slice(0, 10000),
        stderr: stderr.slice(0, 10000),
        message: timedOut ? 'Command timed out.' : code === 0 ? 'Command completed.' : 'Command failed.'
      });
    });
  });
};
