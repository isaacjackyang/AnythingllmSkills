const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
        queue.push(fullPath);
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
    try {
      const explorerArgs = ['/select,', filePath];
      const child = spawn('explorer.exe', explorerArgs, {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      resolve({ opened: true, target: filePath });
    } catch (error) {
      resolve({ opened: false, error: error.message });
    }
  });
}

module.exports = async function execute(params = {}) {
  const keyword = String(params.keyword || '').trim();
  const rootPath = String(params.rootPath || 'D:\\').trim();
  const maxResults = Number(params.maxResults || 20);
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

  const matches = await walkFiles(rootPath, keyword, Math.max(1, Math.min(maxResults, 100)));

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
          ? 'Search complete. Opened Explorer for the first match.'
          : 'Search complete.'
  };
};
