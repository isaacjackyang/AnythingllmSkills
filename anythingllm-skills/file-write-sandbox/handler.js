const fs = require('fs');
const path = require('path');

const SANDBOX_ROOT = 'C:\\agent_sandbox';

function nowIso() {
  return new Date().toISOString();
}

function fail(action, message, detail = {}) {
  return { ok: false, action, error: { message, ...detail }, audit: { timestamp: nowIso() } };
}

function pass(action, data) {
  return { ok: true, action, data, audit: { timestamp: nowIso() } };
}

function resolveInSandbox(inputPath) {
  const candidate = path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.normalize(path.join(SANDBOX_ROOT, inputPath));

  const root = path.normalize(SANDBOX_ROOT + path.sep).toLowerCase();
  const lowerCandidate = candidate.toLowerCase();
  if (!lowerCandidate.startsWith(root) && lowerCandidate !== SANDBOX_ROOT.toLowerCase()) {
    return { ok: false, message: `Path escapes sandbox: ${inputPath}` };
  }

  return { ok: true, fullPath: candidate };
}

async function execute(input = {}) {
  const action = String(input.action || '').trim();
  if (!['write_text', 'append_text'].includes(action)) {
    return fail(action || 'unknown', 'Unsupported action. Use write_text or append_text.');
  }

  const requestedPath = String(input.path || '').trim();
  const content = String(input.content ?? '');
  const encoding = String(input.encoding || 'utf8');

  if (!requestedPath) return fail(action, 'Missing required parameter: path');

  const resolved = resolveInSandbox(requestedPath);
  if (!resolved.ok) return fail(action, resolved.message);

  const directory = path.dirname(resolved.fullPath);
  fs.mkdirSync(directory, { recursive: true });

  if (action === 'append_text') {
    fs.appendFileSync(resolved.fullPath, content, { encoding });
  } else {
    fs.writeFileSync(resolved.fullPath, content, { encoding });
  }

  return pass(action, {
    path: resolved.fullPath,
    bytesWritten: Buffer.byteLength(content, encoding),
    mode: action === 'append_text' ? 'append' : 'overwrite'
  });
}

async function handler({ input } = {}) {
  return execute(input || {});
}

module.exports = {
  handler,
  execute
};
