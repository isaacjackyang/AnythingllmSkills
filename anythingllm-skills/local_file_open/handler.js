// local_file_open – AnythingLLM custom agent skill
// Validates a local file path and optionally opens it in Windows Explorer.
//
// Contract:
//   module.exports.runtime = { handler }
//   handler MUST return a **string** (AnythingLLM requirement).

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const IS_WINDOWS = process.platform === 'win32';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;

  return defaultValue;
}

function asTrimmedString(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function normalizeFsPath(inputPath) {
  return path.normalize(String(inputPath || ''));
}

function toCanonicalPath(targetPath) {
  const resolved = normalizeFsPath(path.resolve(String(targetPath || '')));
  try {
    return normalizeFsPath(fs.realpathSync.native(resolved));
  } catch (_) {
    return resolved;
  }
}

function getAllowlistRoots(inputAllowlistRoots) {
  const allowlistRootsCandidate =
    inputAllowlistRoots && typeof inputAllowlistRoots === 'object' && !Array.isArray(inputAllowlistRoots)
      ? inputAllowlistRoots.roots || inputAllowlistRoots.paths || ''
      : inputAllowlistRoots;

  const raw = Array.isArray(allowlistRootsCandidate)
    ? allowlistRootsCandidate
    : String(allowlistRootsCandidate || process.env.LOCAL_FILE_SEARCH_ALLOWLIST || '')
      .split(/[;,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const roots = [];
  for (const item of raw) {
    if (!item) continue;
    roots.push(toCanonicalPath(item));
  }

  const unique = [...new Set(roots)];
  return {
    enabled: unique.length > 0,
    roots: unique
  };
}

function isPathUnderRoot(targetPath, rootPath) {
  const normalizedRoot = toCanonicalPath(rootPath);
  const normalizedTarget = toCanonicalPath(targetPath);
  const comparableRoot = IS_WINDOWS ? normalizedRoot.toLowerCase() : normalizedRoot;
  const comparableTarget = IS_WINDOWS ? normalizedTarget.toLowerCase() : normalizedTarget;
  const relative = path.relative(comparableRoot, comparableTarget);
  const firstSegment = relative.split(path.sep)[0];
  return relative === '' || (firstSegment !== '..' && !path.isAbsolute(relative));
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
    if (!fs.existsSync(filePath)) {
      resolve({ opened: false, error: `Target path does not exist: ${filePath}` });
      return;
    }

    const explorerArgs = [`/select,${String(filePath)}`];
    const child = spawn('explorer.exe', explorerArgs, {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    let settled = false;
    let spawnCheckTimer = null;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (spawnCheckTimer) clearTimeout(spawnCheckTimer);
      resolve(result);
    };

    child.once('error', (error) => {
      settle({ opened: false, error: error.message });
    });

    child.once('spawn', () => {
      settle({ opened: true, target: filePath });
    });

    // Older runtimes may not emit `spawn`; keep a delayed fallback.
    spawnCheckTimer = setTimeout(() => {
      settle({ opened: true, target: filePath });
    }, 100);
  });
}

// ---------------------------------------------------------------------------
// Core execution logic (returns an object – internal use / testability)
// ---------------------------------------------------------------------------

async function execute(params = {}) {
  const filePathInput =
    asTrimmedString(params.filePath) ||
    asTrimmedString(params.path) ||
    asTrimmedString(params.filepath) ||
    asTrimmedString(params.targetPath) ||
    asTrimmedString(params.target);
  const openExplorer = parseBoolean(params.openExplorer, true);
  const allowlist = getAllowlistRoots(params.allowlistRoots);

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
    warnings.push('Allowlist is disabled.');
  }
  if (!IS_WINDOWS) {
    warnings.push('Explorer open is only supported on Windows hosts.');
  }

  return {
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
          ? `Opened Explorer for: ${canonicalPath}`
          : 'Could not open Explorer on this host.'
        : `Validated target file path: ${canonicalPath}`
  };
}

// ---------------------------------------------------------------------------
// AnythingLLM runtime handler
//   - Receives flat params from plugin.json entrypoint.params
//   - MUST return a string (AnythingLLM contract)
//   - `this.introspect` / `this.logger` are available via aibitat context
// ---------------------------------------------------------------------------

module.exports.runtime = {
  handler: async function (params = {}) {
    try {
      // `this.introspect` is injected by AnythingLLM to show "thoughts" in UI
      if (this && typeof this.introspect === 'function') {
        const target = params.filePath || params.path || '(unknown)';
        this.introspect(`local_file_open: processing "${target}" …`);
      }

      const result = await execute(params);

      if (this && typeof this.introspect === 'function') {
        if (result.ok) {
          this.introspect(`local_file_open: ${result.message}`);
        } else {
          this.introspect(`local_file_open: failed — ${result.message}`);
        }
      }

      // AnythingLLM requires a string return value
      return JSON.stringify(result);
    } catch (error) {
      const errorResult = {
        ok: false,
        message: `local_file_open encountered an error: ${error.message}`
      };
      return JSON.stringify(errorResult);
    }
  }
};
