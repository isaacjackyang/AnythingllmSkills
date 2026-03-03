const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const IS_WINDOWS = process.platform === 'win32';

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;

  return defaultValue;
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
  const normalizedRoot = IS_WINDOWS ? rootPath.toLowerCase() : rootPath;
  const normalizedTarget = IS_WINDOWS ? targetPath.toLowerCase() : targetPath;
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function validatePathAgainstAllowlist(filePath, allowlist) {
  if (!allowlist.enabled) return { ok: true, canonicalPath: filePath };

  const canonicalPath = toCanonicalPath(filePath);
  const allowed = allowlist.roots.some((allowedRoot) => isPathUnderRoot(canonicalPath, allowedRoot));

  if (!allowed) {
    return {
      ok: false,
      message: 'Target path is outside allowlist. Please provide a filePath under an allowed root.',
      canonicalPath
    };
  }

  return {
    ok: true,
    canonicalPath
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
    const explorerArgs = [`/select,${filePath}`];
    const child = spawn('explorer.exe', explorerArgs, {
      detached: true,
      stdio: 'ignore'
    });

    let settled = false;
    child.once('error', (error) => {
      settled = true;
      resolve({ opened: false, error: error.message });
    });

    // If spawn succeeds, resolve on next tick unless an error event arrives first.
    setImmediate(() => {
      if (settled) return;
      child.unref();
      resolve({ opened: true, target: filePath });
    });
  });
}

async function execute(input = {}, logger) {
  const filePathInput = String(input.filePath || input.path || '').trim();
  const openExplorer = parseBoolean(input.openExplorer, true);
  const allowlist = getAllowlistRoots(input.allowlistRoots);

  if (!filePathInput) {
    return {
      ok: false,
      message: 'Missing required parameter: filePath'
    };
  }

  if (!fs.existsSync(filePathInput)) {
    return {
      ok: false,
      filePath: filePathInput,
      message: `Target path does not exist: ${filePathInput}`
    };
  }

  let stats;
  try {
    stats = fs.statSync(filePathInput);
  } catch (error) {
    return {
      ok: false,
      filePath: filePathInput,
      message: `Unable to stat target path: ${error.message}`
    };
  }
  if (!stats.isFile()) {
    return {
      ok: false,
      filePath: filePathInput,
      message: `Target path is not a file: ${filePathInput}`
    };
  }

  const allowlistValidation = validatePathAgainstAllowlist(filePathInput, allowlist);
  if (!allowlistValidation.ok) {
    return {
      ok: false,
      filePath: filePathInput,
      allowlist: {
        enabled: allowlist.enabled,
        roots: allowlist.roots,
        blockedRoots: [filePathInput]
      },
      message: allowlistValidation.message
    };
  }

  const canonicalPath = allowlistValidation.canonicalPath;
  const dirPath = path.dirname(canonicalPath);

  let explorerResult = null;
  if (openExplorer) {
    explorerResult = await openInExplorer(canonicalPath);
  }

  const warnings = [];
  if (!allowlist.enabled) {
    warnings.push('Allowlist is disabled. Consider setting allowlistRoots or LOCAL_FILE_SEARCH_ALLOWLIST for production.');
  }
  if (!IS_WINDOWS) {
    warnings.push('Explorer open is only supported on Windows hosts.');
  }

  const response = {
    ok: true,
    filePath: canonicalPath,
    directoryPath: dirPath,
    warning: warnings.filter(Boolean).join(' ') || null,
    allowlist: {
      enabled: allowlist.enabled,
      roots: allowlist.roots,
      blockedRoots: []
    },
    explorer: explorerResult,
    message:
      openExplorer
        ? explorerResult && explorerResult.opened
          ? 'Opened Explorer for the target file.'
          : 'Could not open Explorer on this host.'
        : 'Validated target file path.'
  };

  if (logger && typeof logger.info === 'function') {
    logger.info('local_file_open completed', {
      ok: response.ok,
      filePath: response.filePath,
      openExplorer,
      allowlistEnabled: allowlist.enabled
    });
  }

  return response;
}

async function handler({ input, logger } = {}) {
  return execute(input || {}, logger);
}

// Export in multiple CJS-compatible shapes so different runtimes can load this
// skill whether they expect `module.handler(...)`, a default export, or a
// callable function export with properties.
module.exports = handler;
module.exports.handler = handler;
module.exports.execute = execute;
module.exports.default = {
  handler,
  execute
};
