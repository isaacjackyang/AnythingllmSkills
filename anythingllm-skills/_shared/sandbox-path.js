const path = require('path');

function resolveSandboxPath(sandboxRoot, inputPath) {
  const candidate = path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.normalize(path.join(sandboxRoot, inputPath));

  const normalizedRootWithSep = path.normalize(sandboxRoot + path.sep).toLowerCase();
  const normalizedRoot = path.normalize(sandboxRoot).toLowerCase();
  const normalizedCandidate = candidate.toLowerCase();

  const insideSandbox =
    normalizedCandidate.startsWith(normalizedRootWithSep) || normalizedCandidate === normalizedRoot;

  if (!insideSandbox) {
    return { ok: false, message: `Path escapes sandbox: ${inputPath}` };
  }

  return { ok: true, fullPath: candidate };
}

module.exports = {
  resolveSandboxPath
};
