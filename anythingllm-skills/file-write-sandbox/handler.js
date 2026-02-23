const fs = require('fs');
const path = require('path');
const { ok, error } = require('../_shared/response');
const { resolveSandboxPath } = require('../_shared/sandbox-path');

const SANDBOX_ROOT = 'C:\\agent_sandbox';

module.exports = async function execute(params = {}) {
  const action = String(params.action || '').trim();
  if (!['write_text', 'append_text'].includes(action)) {
    return error(action || 'unknown', 'Unsupported action. Use write_text or append_text.');
  }

  const targetPath = String(params.path || '').trim();
  const content = String(params.content ?? '');
  const encoding = String(params.encoding || 'utf8');

  if (!targetPath) return error(action, 'Missing required parameter: path');

  const resolvedPath = resolveSandboxPath(SANDBOX_ROOT, targetPath);
  if (!resolvedPath.ok) return error(action, resolvedPath.message);

  const directory = path.dirname(resolvedPath.fullPath);
  fs.mkdirSync(directory, { recursive: true });

  if (action === 'append_text') {
    fs.appendFileSync(resolvedPath.fullPath, content, { encoding });
  } else {
    fs.writeFileSync(resolvedPath.fullPath, content, { encoding });
  }

  return ok(action, {
    path: resolvedPath.fullPath,
    bytesWritten: Buffer.byteLength(content, encoding),
    mode: action === 'append_text' ? 'append' : 'overwrite'
  });
};
