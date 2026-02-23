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
  const encoding = String(params.encoding || 'utf8');
  const maxBytes = Math.max(1, Math.min(Number(params.maxBytes || 65536), 1024 * 1024));

  if (!requestedPath) {
    return { ok: false, message: 'Missing required parameter: path' };
  }

  const resolved = resolveInSandbox(requestedPath);
  if (!resolved.ok) return { ok: false, message: resolved.message };

  if (!fs.existsSync(resolved.fullPath)) {
    return { ok: false, message: `File does not exist: ${resolved.fullPath}` };
  }

  const stat = fs.statSync(resolved.fullPath);
  if (!stat.isFile()) {
    return { ok: false, message: `Target is not a file: ${resolved.fullPath}` };
  }

  const fd = fs.openSync(resolved.fullPath, 'r');
  const size = Math.min(stat.size, maxBytes);
  const buffer = Buffer.alloc(size);
  fs.readSync(fd, buffer, 0, size, 0);
  fs.closeSync(fd);

  return {
    ok: true,
    path: resolved.fullPath,
    bytesRead: size,
    truncated: stat.size > size,
    content: buffer.toString(encoding)
  };
};
