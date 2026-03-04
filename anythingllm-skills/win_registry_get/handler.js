module.exports.runtime = {
  handler: async function ({ hive, keyPath, valueName, timeoutMs }) {
    const { spawn } = require('child_process');

    const start = Date.now();
    const respond = (payload) => JSON.stringify({ ...payload, meta: { ...(payload.meta || {}), durationMs: Date.now() - start } });

    if (process.platform !== 'win32') {
      return respond({ ok: false, code: 'UNSUPPORTED_PLATFORM', message: 'win_registry_get only supports Windows host.' });
    }

    const h = String(hive || '').trim().toUpperCase();
    const k = String(keyPath || '').trim();
    const v = String(valueName || '').trim();
    const timeout = Math.max(1000, Math.min(Number(timeoutMs || 10000), 30000));
    const allowedHives = new Set(['HKLM', 'HKCU', 'HKCR', 'HKU', 'HKCC']);

    if (!allowedHives.has(h)) return respond({ ok: false, code: 'INVALID_INPUT', message: 'Invalid hive. Allowed: HKLM/HKCU/HKCR/HKU/HKCC' });
    if (!k || !v) return respond({ ok: false, code: 'INVALID_INPUT', message: 'Missing required parameter: keyPath/valueName' });

    const psPath = `${h}:\\${k.replace(/^\\+/, '')}`;
    const escapedPath = psPath.replace(/'/g, "''");
    const escapedValueName = v.replace(/'/g, "''");
    const psScript = [
      '$ErrorActionPreference = "Stop"',
      `$path = '${escapedPath}'`,
      `$name = '${escapedValueName}'`,
      '$val = (Get-ItemProperty -LiteralPath $path -Name $name).$name',
      '[PSCustomObject]@{ path=$path; name=$name; value=$val } | ConvertTo-Json -Compress'
    ].join('; ');

    return await new Promise((resolve) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-Command', psScript], { windowsHide: true });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeout);

      child.stdout.on('data', (d) => (stdout += String(d)));
      child.stderr.on('data', (d) => (stderr += String(d)));

      child.on('close', () => {
        clearTimeout(timer);
        if (timedOut) return resolve(respond({ ok: false, code: 'TIMEOUT', message: 'PowerShell timed out.' }));
        if (stderr.trim()) {
          const lower = stderr.toLowerCase();
          if (lower.includes('cannot find path') || lower.includes('property') && lower.includes('cannot be found')) {
            return resolve(respond({ ok: false, code: 'NOT_FOUND', message: `Registry key/value not found: ${psPath} :: ${v}` }));
          }
          return resolve(respond({ ok: false, code: 'UPSTREAM_ERROR', message: stderr.trim().slice(0, 1000) }));
        }

        try {
          const parsed = JSON.parse(stdout || '{}');
          this.introspect(`win_registry_get read ${parsed.path} (${parsed.name})`);
          resolve(respond({ ok: true, code: 'OK', message: 'fetched', data: parsed }));
        } catch (e) {
          resolve(respond({ ok: false, code: 'UPSTREAM_ERROR', message: e.message }));
        }
      });
    });
  }
};
