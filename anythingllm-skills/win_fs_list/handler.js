module.exports.runtime = {
  handler: async function ({ path, maxItems }) {
    const fs = require('fs');
    const nodePath = require('path');

    const start = Date.now();
    const respond = (payload) => JSON.stringify({ ...payload, meta: { ...(payload.meta || {}), durationMs: Date.now() - start } });

    if (process.platform !== 'win32') {
      return respond({ ok: false, code: 'UNSUPPORTED_PLATFORM', message: 'win_fs_list only supports Windows host.' });
    }

    const target = String(path || '').trim();
    const limit = Math.max(1, Math.min(Number(maxItems || 100), 500));
    if (!target) return respond({ ok: false, code: 'INVALID_INPUT', message: 'Missing required parameter: path' });

    try {
      const fullPath = nodePath.resolve(target);
      if (!fs.existsSync(fullPath)) return respond({ ok: false, code: 'NOT_FOUND', message: `Path not found: ${fullPath}` });

      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) return respond({ ok: false, code: 'INVALID_INPUT', message: `Target is not a directory: ${fullPath}` });

      const names = fs.readdirSync(fullPath).slice(0, limit);
      const entries = names.map((name) => {
        const p = nodePath.join(fullPath, name);
        const s = fs.statSync(p);
        return {
          name,
          kind: s.isDirectory() ? 'directory' : 'file',
          size: s.size,
          mtime: s.mtime.toISOString()
        };
      });

      this.introspect(`win_fs_list listed ${entries.length} entries from ${fullPath}`);
      return respond({ ok: true, code: 'OK', message: 'listed', data: { path: fullPath, total: entries.length, entries } });
    } catch (error) {
      return respond({ ok: false, code: 'UPSTREAM_ERROR', message: error.message });
    }
  }
};
