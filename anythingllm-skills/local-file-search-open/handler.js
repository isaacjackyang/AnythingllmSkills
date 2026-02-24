const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SCOPE_TO_PATH = {
  c: 'C:\\',
  d: 'D:\\'
};

const IS_WINDOWS = process.platform === 'win32';

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

function getDefaultRootPath() {
  if (!IS_WINDOWS) return process.cwd();
  if (fs.existsSync('D:\\')) return 'D:\\';
  if (fs.existsSync('C:\\')) return 'C:\\';
  const roots = listAvailableDriveRoots();
  if (roots.length > 0) return roots[0];
  return 'C:\\';
}

function resolveSearchRoots(scope, rootPath) {
  if (!IS_WINDOWS) {
    const customRoot = String(rootPath || process.cwd()).trim() || process.cwd();
    if (fs.existsSync(customRoot)) {
      return {
        ok: true,
        roots: [customRoot],
        warning: 'Non-Windows host detected. Using rootPath/current working directory as search root.'
      };
    }

    return {
      ok: true,
      roots: [process.cwd()],
      warning: 'Non-Windows host detected. rootPath not found, fallback to current working directory.'
    };
  }

  if (scope === 'all') {
    const roots = listAvailableDriveRoots();
    if (roots.length === 0) {
      return { ok: false, message: 'No available drive roots found on this host.', roots: [] };
    }
    return { ok: true, roots };
  }

  if (scope === 'custom') {
    const customRoot = String(rootPath || getDefaultRootPath()).trim();
    if (!fs.existsSync(customRoot)) {
      return { ok: false, message: `Search root does not exist: ${customRoot}`, roots: [] };
    }
    return { ok: true, roots: [customRoot] };
  }

  const preferredRoot = SCOPE_TO_PATH[scope] || 'D:\\';
  if (fs.existsSync(preferredRoot)) {
    return { ok: true, roots: [preferredRoot] };
  }

  const fallbackRoot = getDefaultRootPath();
  if (!fs.existsSync(fallbackRoot)) {
    return {
      ok: false,
      message: `Selected search scope "${scope}" is unavailable on this host and no fallback drive was found.`,
      roots: []
    };
  }

  return {
    ok: true,
    roots: [fallbackRoot],
    warning: `Selected search scope "${scope}" is unavailable. Fallback to ${fallbackRoot}.`
  };
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
  if (!IS_WINDOWS) {
    return Promise.resolve({
      opened: false,
      error: 'Explorer open is only supported on Windows hosts.'
    });
  }

  return new Promise((resolve) => {
    try {
      const explorerArgs = [`/select,${filePath}`];
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

async function execute(input = {}, logger) {
  const keyword = String(input.keyword || '').trim();
  const searchScope = normalizeScope(input.searchScope);
  const rootPath = String(input.rootPath || getDefaultRootPath()).trim();
  const maxResults = Number(input.maxResults || 20);
  const openExplorer = Boolean(input.openExplorer || false);

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

  const response = {
    ok: true,
    keyword,
    searchScope,
    rootPath: searchScope === 'custom' ? rootPath : null,
    scannedRoots: rootResolution.roots,
    warning: rootResolution.warning || null,
    count: matches.length,
    matches,
    explorer: explorerResult,
    message:
      matches.length === 0
        ? 'No files matched the keyword.'
        : openExplorer
          ? explorerResult && explorerResult.opened
            ? 'Search complete. Opened Explorer for the first match.'
            : 'Search complete. Found matches but could not open Explorer on this host.'
          : 'Search complete.'
  };

  if (logger && typeof logger.info === 'function') {
    logger.info('local_file_search_open completed', {
      ok: response.ok,
      count: response.count,
      searchScope: response.searchScope
    });
  }

  return response;
}

async function handler({ input, logger } = {}) {
  return execute(input || {}, logger);
}

module.exports = {
  handler,
  execute
};
