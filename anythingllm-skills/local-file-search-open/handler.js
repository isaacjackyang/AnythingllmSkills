const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SCOPE_TO_PATH = {
  c: 'C:\\',
  d: 'D:\\'
};

function normalizeScope(scope) {
  const value = String(scope || 'd').trim().toLowerCase();
  if (['all', 'c', 'd', 'custom'].includes(value)) return value;
  return 'd';
}

function listAvailableDriveRoots() {
  const roots = [];
  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code);
    const root = `${letter}:\\`;
    if (fs.existsSync(root)) roots.push(root);
  }
  return roots;
}

function resolveSearchRoots(scope, rootPath) {
  if (scope === 'all') {
    const roots = listAvailableDriveRoots();
    if (roots.length === 0) {
      return { ok: false, message: 'No available drive roots found on this host.', roots: [] };
    }
    return { ok: true, roots };
  }

  if (scope === 'custom') {
    const customRoot = String(rootPath || 'D:\\').trim();
    if (!fs.existsSync(customRoot)) {
      return { ok: false, message: `Search root does not exist: ${customRoot}`, roots: [] };
    }
    return { ok: true, roots: [customRoot] };
  }

  const fixedRoot = SCOPE_TO_PATH[scope] || 'D:\\';
  if (!fs.existsSync(fixedRoot)) {
    return {
      ok: false,
      message: `Selected search scope "${scope}" is unavailable on this host: ${fixedRoot}`,
      roots: []
    };
  }
  return { ok: true, roots: [fixedRoot] };
}

async function walkFiles(searchRoots, keyword, maxResults) {
  const queue = [...searchRoots];
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
  const searchScope = normalizeScope(params.searchScope);
  const rootPath = String(params.rootPath || 'D:\\').trim();
  const maxResults = Number(params.maxResults || 20);
  const openExplorer = Boolean(params.openExplorer || false);

  if (!keyword) {
    return {
      ok: false,
      message: 'Missing required parameter: keyword'
    };
  }

  const rootResolution = resolveSearchRoots(searchScope, rootPath);
  if (!rootResolution.ok) {
    return {
      ok: false,
      searchScope,
      rootPath,
      message: rootResolution.message
    };
  }

  const matches = await walkFiles(
    rootResolution.roots,
    keyword,
    Math.max(1, Math.min(maxResults, 100))
  );

  let explorerResult = null;
  if (openExplorer && matches.length > 0) {
    explorerResult = await openInExplorer(matches[0]);
  }

  return {
    ok: true,
    keyword,
    searchScope,
    rootPath: searchScope === 'custom' ? rootPath : null,
    scannedRoots: rootResolution.roots,
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
