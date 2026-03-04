module.exports.runtime = {
  handler: async function ({ maxItems, nameFilter, timeoutMs }) {
    const { spawn } = require('child_process');

    const start = Date.now();
    const respond = (payload) => JSON.stringify({ ...payload, meta: { ...(payload.meta || {}), durationMs: Date.now() - start } });

    if (process.platform !== 'win32') {
      return respond({ ok: false, code: 'UNSUPPORTED_PLATFORM', message: 'win_process_list only supports Windows host.' });
    }

    const limit = Math.max(1, Math.min(Number(maxItems || 50), 200));
    const filter = String(nameFilter || '').trim().toLowerCase();
    const timeout = Math.max(1000, Math.min(Number(timeoutMs || 10000), 30000));

    const psScript = [
      '$ErrorActionPreference = "Stop"',
      '$procs = Get-Process | Select-Object ProcessName,Id,CPU,WS',
      '$procs | ConvertTo-Json -Depth 3 -Compress'
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
        if (stderr.trim()) return resolve(respond({ ok: false, code: 'UPSTREAM_ERROR', message: stderr.trim().slice(0, 1000) }));

        try {
          const parsed = JSON.parse(stdout || '[]');
          const list = (Array.isArray(parsed) ? parsed : [parsed])
            .filter((p) => !filter || String(p.ProcessName || '').toLowerCase().includes(filter))
            .slice(0, limit)
            .map((p) => ({
              name: p.ProcessName,
              pid: p.Id,
              cpu: p.CPU ?? null,
              workingSet: p.WS ?? null
            }));

          this.introspect(`win_process_list returned ${list.length} process rows`);
          resolve(respond({ ok: true, code: 'OK', message: 'listed', data: { total: list.length, items: list } }));
        } catch (e) {
          resolve(respond({ ok: false, code: 'UPSTREAM_ERROR', message: e.message }));
        }
      });
    });
  }
};
