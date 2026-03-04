module.exports.runtime = {
  handler: async function ({ serviceName, timeoutMs }) {
    const { spawn } = require('child_process');

    const start = Date.now();
    const respond = (payload) => JSON.stringify({ ...payload, meta: { ...(payload.meta || {}), durationMs: Date.now() - start } });

    if (process.platform !== 'win32') {
      return respond({ ok: false, code: 'UNSUPPORTED_PLATFORM', message: 'win_service_status only supports Windows host.' });
    }

    const name = String(serviceName || '').trim();
    if (!name) return respond({ ok: false, code: 'INVALID_INPUT', message: 'Missing required parameter: serviceName' });
    const timeout = Math.max(1000, Math.min(Number(timeoutMs || 10000), 30000));

    const psScript = [
      '$ErrorActionPreference = "Stop"',
      `$svc = Get-CimInstance Win32_Service -Filter "Name='${name.replace(/'/g, "''")}'"`,
      'if (-not $svc) { throw "SERVICE_NOT_FOUND" }',
      '$svc | Select-Object Name,DisplayName,State,StartMode,Status | ConvertTo-Json -Compress'
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
        if (stderr.includes('SERVICE_NOT_FOUND')) return resolve(respond({ ok: false, code: 'NOT_FOUND', message: `Service not found: ${name}` }));
        if (stderr.trim()) return resolve(respond({ ok: false, code: 'UPSTREAM_ERROR', message: stderr.trim().slice(0, 1000) }));

        try {
          const svc = JSON.parse(stdout || '{}');
          this.introspect(`win_service_status fetched ${name}`);
          resolve(respond({ ok: true, code: 'OK', message: 'fetched', data: svc }));
        } catch (e) {
          resolve(respond({ ok: false, code: 'UPSTREAM_ERROR', message: e.message }));
        }
      });
    });
  }
};
