const fs = require('fs');
const path = require('path');

const SANDBOX_ROOT = 'C:\\agent_sandbox';

function resolveInSandbox(inputPath) {
  const candidate = path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.normalize(path.join(SANDBOX_ROOT, inputPath));

  const root = path.normalize(SANDBOX_ROOT + path.sep);
  if (!candidate.toLowerCase().startsWith(root.toLowerCase()) && candidate.toLowerCase() !== SANDBOX_ROOT.toLowerCase()) {
    return { ok: false, message: `Path escapes sandbox: ${inputPath}` };
  }

  return { ok: true, fullPath: candidate };
}

module.exports = async function execute(params = {}) {
  const requestedPath = String(params.path || '').trim();
  const content = String(params.content ?? '');
  const append = Boolean(params.append || false);
  const encoding = String(params.encoding || 'utf8');

  if (!requestedPath) {
    return { ok: false, message: 'Missing required parameter: path' };
  }

  const resolved = resolveInSandbox(requestedPath);
  if (!resolved.ok) return { ok: false, message: resolved.message };

  const directory = path.dirname(resolved.fullPath);
  fs.mkdirSync(directory, { recursive: true });

  if (append) {
    fs.appendFileSync(resolved.fullPath, content, { encoding });
  } else {
    fs.writeFileSync(resolved.fullPath, content, { encoding });
  }

  const bytes = Buffer.byteLength(content, encoding);
  return {
    ok: true,
    path: resolved.fullPath,
    append,
    bytesWritten: bytes,
    message: append ? 'Content appended.' : 'Content written.'
  };
};
