const fs = require('fs');
const { ok, error } = require('../_shared/response');
const { resolveSandboxPath } = require('../_shared/sandbox-path');

const SANDBOX_ROOT = 'C:\\agent_sandbox';

module.exports = async function execute(params = {}) {
  const action = String(params.action || '').trim();
  if (action !== 'read_text') {
    return error(action || 'unknown', 'Unsupported action. Only read_text is available.');
  }

  const targetPath = String(params.path || '').trim();
  const encoding = String(params.encoding || 'utf8');
  const maxBytes = Math.max(1, Math.min(Number(params.maxBytes || 65536), 1024 * 1024));

  if (!targetPath) return error(action, 'Missing required parameter: path');

  const resolvedPath = resolveSandboxPath(SANDBOX_ROOT, targetPath);
  if (!resolvedPath.ok) return error(action, resolvedPath.message);
  if (!fs.existsSync(resolvedPath.fullPath)) return error(action, `File does not exist: ${resolvedPath.fullPath}`);

  const stat = fs.statSync(resolvedPath.fullPath);
  if (!stat.isFile()) return error(action, `Target is not a file: ${resolvedPath.fullPath}`);

  const fd = fs.openSync(resolvedPath.fullPath, 'r');
  const bytesToRead = Math.min(stat.size, maxBytes);
  const buffer = Buffer.alloc(bytesToRead);
  fs.readSync(fd, buffer, 0, bytesToRead, 0);
  fs.closeSync(fd);

  return ok(action, {
    path: resolvedPath.fullPath,
    bytesRead: bytesToRead,
    truncated: stat.size > bytesToRead,
    content: buffer.toString(encoding)
  });
};
