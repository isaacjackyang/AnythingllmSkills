const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_MAX_RESULTS = 20;
const HARD_MAX_RESULTS = 100;
const DEFAULT_MAX_DEPTH = 12;
const HARD_MAX_DEPTH = 30;
const DEFAULT_TIMEOUT_MS = 15000;

const DEFAULT_SKIP_DIRS = new Set([
  '$recycle.bin',
  'system volume information',
  'node_modules',
  '.git'
]);

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

function toCanonicalPath(targetPath) {
  try {
    return fs.realpathSync.native(targetPath);
  } catch (_) {
    return path.resolve(targetPath);
  }
}

function getAllowlistRoots(inputAllowlistRoots) {
  const raw = Array.isArray(inputAllowlistRoots)
    ? inputAllowlistRoots
    : String(inputAllowlistRoots || process.env.LOCAL_FILE_SEARCH_ALLOWLIST || '')
        .split(/[;,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);

  const roots = [];
  for (const item of raw) {
    if (!item || !fs.existsSync(item)) continue;
    roots.push(toCanonicalPath(item));
  }

  const unique = [...new Set(roots)];
  return {
    enabled: unique.length > 0,
    roots: unique
  };
}

function isPathUnderRoot(targetPath, rootPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function applyAllowlistToRoots(roots, allowlist) {
  if (!allowlist.enabled) return { ok: true, roots, blocked: [] };

  const allowedRoots = roots.filter((candidate) => {
    const canonical = toCanonicalPath(candidate);
    return allowlist.roots.some((allowedRoot) => isPathUnderRoot(canonical, allowedRoot));
  });

  const blockedRoots = roots.filter((item) => !allowedRoots.includes(item));

  if (allowedRoots.length === 0) {
    return {
      ok: false,
      message: 'Search roots are outside allowlist. Please use a rootPath under allowed roots.',
      roots: [],
      blocked: blockedRoots
    };
  }

  return {
    ok: true,
    roots: allowedRoots,
    blocked: blockedRoots
  };
}

async function walkFiles(searchRoots, keyword, options = {}) {
  const maxResults = Math.max(
    1,
    Math.min(Number(options.maxResults || DEFAULT_MAX_RESULTS), HARD_MAX_RESULTS)
  );
  const maxDepth = Math.max(1, Math.min(Number(options.maxDepth || DEFAULT_MAX_DEPTH), HARD_MAX_DEPTH));
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));

  const queue = searchRoots.map((root) => ({ dir: root, depth: 0 }));
  const results = [];
  const normalizedKeyword = keyword.toLowerCase();
  const visited = new Set();
  const startedAt = Date.now();

  let timeoutHit = false;
  let pointer = 0;

  while (pointer < queue.length && results.length < maxResults) {
    if (Date.now() - startedAt > timeoutMs) {
      timeoutHit = true;
      break;
    }

    const { dir: current, depth } = queue[pointer];
    pointer += 1;

    let realCurrent = current;
    try {
      realCurrent = fs.realpathSync.native(current);
    } catch (_) {
      continue;
    }

    if (visited.has(realCurrent)) continue;
    visited.add(realCurrent);

    let entries = [];
    try {
      entries = fs.readdirSync(realCurrent, { withFileTypes: true });
    } catch (_) {
      continue;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) break;

      const fullPath = path.join(realCurrent, entry.name);

      if (entry.isDirectory()) {
        if (DEFAULT_SKIP_DIRS.has(entry.name.toLowerCase())) continue;
        if (depth >= maxDepth) continue;
        queue.push({ dir: fullPath, depth: depth + 1 });
        continue;
      }

      if (entry.name.toLowerCase().includes(normalizedKeyword)) {
        results.push(fullPath);
      }
    }
  }

  return {
    matches: results,
    timeoutHit,
    elapsedMs: Date.now() - startedAt,
    maxDepth,
    maxResults,
    timeoutMs
  };
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
  const maxResults = Number(input.maxResults || DEFAULT_MAX_RESULTS);
  const maxDepth = Number(input.maxDepth || DEFAULT_MAX_DEPTH);
  const timeoutMs = Number(input.timeoutMs || DEFAULT_TIMEOUT_MS);
  const openExplorer = Boolean(input.openExplorer || false);
  const allowlist = getAllowlistRoots(input.allowlistRoots);

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

  const allowedRootResolution = applyAllowlistToRoots(rootResolution.roots, allowlist);
  if (!allowedRootResolution.ok) {
    return {
      ok: false,
      keyword,
      searchScope,
      rootPath: searchScope === 'custom' ? rootPath : null,
      allowlist: {
        enabled: allowlist.enabled,
        roots: allowlist.roots,
        blockedRoots: allowedRootResolution.blocked
      },
      message: allowedRootResolution.message
    };
  }

  const searchResult = await walkFiles(allowedRootResolution.roots, keyword, {
    maxResults,
    maxDepth,
    timeoutMs
  });
  const matches = searchResult.matches;

  let explorerResult = null;
  if (openExplorer && matches.length > 0) {
    explorerResult = await openInExplorer(matches[0]);
  }

  const warnings = [rootResolution.warning || null];
  if (allowlist.enabled && allowedRootResolution.blocked.length > 0) {
    warnings.push('Some search roots were excluded by allowlist.');
  }
  if (!allowlist.enabled) {
    warnings.push('Allowlist is disabled. Consider setting allowlistRoots or LOCAL_FILE_SEARCH_ALLOWLIST for production.');
  }
  if (searchResult.timeoutHit) {
    warnings.push('Search stopped due to timeout.');
  }

  const response = {
    ok: true,
    keyword,
    searchScope,
    rootPath: searchScope === 'custom' ? rootPath : null,
    scannedRoots: allowedRootResolution.roots,
    warning: warnings.filter(Boolean).join(' ') || null,
    allowlist: {
      enabled: allowlist.enabled,
      roots: allowlist.roots,
      blockedRoots: allowedRootResolution.blocked
    },
    limits: {
      maxResults: searchResult.maxResults,
      maxDepth: searchResult.maxDepth,
      timeoutMs: searchResult.timeoutMs,
      elapsedMs: searchResult.elapsedMs,
      timeoutHit: searchResult.timeoutHit
    },
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
      searchScope: response.searchScope,
      timeoutHit: searchResult.timeoutHit,
      elapsedMs: searchResult.elapsedMs,
      allowlistEnabled: allowlist.enabled
    });
  }

  return response;
}

async function handler({ input, logger } = {}) {
  const result = await execute(input || {}, logger);
  return JSON.stringify(result);
}

module.exports = {
  handler,
  execute
};
