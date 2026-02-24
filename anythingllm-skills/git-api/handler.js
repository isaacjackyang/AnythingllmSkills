function nowIso() {
  return new Date().toISOString();
}

function fail(action, message, detail = {}) {
  return { ok: false, action, error: { message, ...detail }, audit: { timestamp: nowIso() } };
}

function pass(action, data, audit = {}) {
  return { ok: true, action, data, audit: { timestamp: nowIso(), ...audit } };
}

function isSafeIdentifier(value) {
  return /^[a-zA-Z0-9._-]+$/.test(value || '');
}

async function githubRequest(method, endpoint, token, body) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload = text;
  try {
    payload = JSON.parse(text);
  } catch (_) {
    // keep text
  }

  return { ok: response.ok, status: response.status, payload };
}

async function execute(input = {}) {
  const action = String(input.action || '').trim();
  const token = process.env.GITHUB_TOKEN;

  if (!token) return fail(action || 'unknown', 'Missing GITHUB_TOKEN environment variable.');

  if (action === 'get_user') {
    const result = await githubRequest('GET', '/user', token);
    return result.ok
      ? pass(action, result.payload, { status: result.status, endpoint: '/user' })
      : fail(action, 'GitHub API error.', { status: result.status, endpoint: '/user', payload: result.payload });
  }

  if (action === 'list_issues') {
    const owner = String(input.owner || '').trim();
    const repo = String(input.repo || '').trim();
    const state = String(input.state || 'open').trim();

    if (!isSafeIdentifier(owner) || !isSafeIdentifier(repo)) {
      return fail(action, 'Invalid owner/repo format.');
    }

    const endpoint = `/repos/${owner}/${repo}/issues?state=${encodeURIComponent(state)}`;
    const result = await githubRequest('GET', endpoint, token);
    return result.ok
      ? pass(action, result.payload, { status: result.status, endpoint })
      : fail(action, 'GitHub API error.', { status: result.status, endpoint, payload: result.payload });
  }

  if (action === 'create_pull_request') {
    const owner = String(input.owner || '').trim();
    const repo = String(input.repo || '').trim();
    const title = String(input.title || '').trim();
    const body = String(input.body || '').trim();
    const head = String(input.head || '').trim();
    const base = String(input.base || 'main').trim();

    if (!isSafeIdentifier(owner) || !isSafeIdentifier(repo)) {
      return fail(action, 'Invalid owner/repo format.');
    }

    if (!title || !head || !base) {
      return fail(action, 'title, head, and base are required for create_pull_request.');
    }

    const endpoint = `/repos/${owner}/${repo}/pulls`;
    const result = await githubRequest('POST', endpoint, token, { title, body, head, base });
    return result.ok
      ? pass(action, result.payload, { status: result.status, endpoint })
      : fail(action, 'GitHub API error.', { status: result.status, endpoint, payload: result.payload });
  }

  return fail(action || 'unknown', 'Unsupported action. Use get_user, list_issues, create_pull_request.');
}

async function handler({ input } = {}) {
  return execute(input || {});
}

module.exports = {
  handler,
  execute
};
