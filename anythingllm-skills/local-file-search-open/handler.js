const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function normalizeLimit(input, defaultValue = 20, min = 1, max = 100) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

async function walkFiles(rootPath, keyword, maxResults) {
  const queue = [rootPath];
  const results = [];
  const normalizedKeyword = keyword.toLowerCase();

  while (queue.length && results.length < maxResults) {
    const current = queue.shift();
    let entries = [];

    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!entry.isSymbolicLink()) {
          queue.push(fullPath);
        }
        continue;
      }

      if (entry.name.toLowerCase().includes(normalizedKeyword)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function openInExplorer(filePath) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ opened: false, error: 'Explorer is only available on Windows (win32).' });
      return;
    }

    const child = spawn('explorer.exe', [`/select,${filePath}`], {
      detached: true,
      stdio: 'ignore'
    });

    child.once('error', (error) => {
      resolve({ opened: false, error: error.message });
    });

    child.once('spawn', () => {
      child.unref();
      resolve({ opened: true, target: filePath });
    });
  });
}

async function execute(params = {}) {
  const keyword = String(params.keyword || '').trim();
  const rootPath = String(params.rootPath || 'D:\\').trim();
  const maxResults = normalizeLimit(params.maxResults);
  const openExplorer = Boolean(params.openExplorer || false);

  if (!keyword) {
    return {
      ok: false,
      message: 'Missing required parameter: keyword'
    };
  }

  if (!fs.existsSync(rootPath)) {
    return {
      ok: false,
      message: `Search root does not exist: ${rootPath}`
    };
  }

  const matches = await walkFiles(rootPath, keyword, maxResults);

  let explorerResult = null;
  if (openExplorer && matches.length > 0) {
    explorerResult = await openInExplorer(matches[0]);
  }

  return {
    ok: true,
    keyword,
    rootPath,
    count: matches.length,
    matches,
    explorer: explorerResult,
    message:
      matches.length === 0
        ? 'No files matched the keyword.'
        : openExplorer
          ? 'Search complete. Attempted to open Explorer for the first match.'
          : 'Search complete.'
  };
}

module.exports = execute;
module.exports.execute = execute;
module.exports.run = execute;
module.exports.handler = execute;
