module.exports.runtime = {
  handler: async function ({ path, encoding, maxBytes }) {
    const fs = require('fs');
    const nodePath = require('path');

    const start = Date.now();
    const respond = (payload) => JSON.stringify({ ...payload, meta: { ...(payload.meta || {}), durationMs: Date.now() - start } });

    if (process.platform !== 'win32') {
      return respond({ ok: false, code: 'UNSUPPORTED_PLATFORM', message: 'win_fs_read_text only supports Windows host.' });
    }

    const target = String(path || '').trim();
    const textEncoding = String(encoding || 'utf8').trim();
    const cap = Math.max(1, Math.min(Number(maxBytes || 65536), 1024 * 1024));
    if (!target) return respond({ ok: false, code: 'INVALID_INPUT', message: 'Missing required parameter: path' });

    try {
      const fullPath = nodePath.resolve(target);
      if (!fs.existsSync(fullPath)) return respond({ ok: false, code: 'NOT_FOUND', message: `Path not found: ${fullPath}` });

      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return respond({ ok: false, code: 'INVALID_INPUT', message: `Target is not a file: ${fullPath}` });

      const fd = fs.openSync(fullPath, 'r');
      const size = Math.min(stat.size, cap);
      const buffer = Buffer.alloc(size);
      fs.readSync(fd, buffer, 0, size, 0);
      fs.closeSync(fd);

      this.introspect(`win_fs_read_text read ${size} bytes from ${fullPath}`);
      return respond({
        ok: true,
        code: 'OK',
        message: 'read',
        data: {
          path: fullPath,
          bytesRead: size,
          truncated: stat.size > size,
          encoding: textEncoding,
          content: buffer.toString(textEncoding)
        }
      });
    } catch (error) {
      return respond({ ok: false, code: 'UPSTREAM_ERROR', message: error.message });
    }
  }
};
