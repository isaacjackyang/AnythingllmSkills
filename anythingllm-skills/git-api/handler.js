const { ok, error } = require('../_shared/response');

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

  return { ok: response.ok, status: response.status, payload, endpoint };
}

function buildRepoContext(params) {
  const owner = String(params.owner || '').trim();
  const repo = String(params.repo || '').trim();

  if (!isSafeIdentifier(owner) || !isSafeIdentifier(repo)) {
    return { ok: false, message: 'Invalid owner/repo format.' };
  }

  return { ok: true, owner, repo };
}

module.exports = async function execute(params = {}) {
  const action = String(params.action || '').trim();
  const token = process.env.GITHUB_TOKEN;
  if (!token) return error(action || 'unknown', 'Missing GITHUB_TOKEN environment variable.');

  if (action === 'get_user') {
    const result = await githubRequest('GET', '/user', token);
    return result.ok
      ? ok(action, result.payload, { status: result.status, endpoint: result.endpoint })
      : error(action, 'GitHub API error.', { status: result.status, endpoint: result.endpoint, payload: result.payload });
  }

  if (action === 'list_issues') {
    const repoContext = buildRepoContext(params);
    if (!repoContext.ok) return error(action, repoContext.message);

    const state = String(params.state || 'open').trim();
    const endpoint = `/repos/${repoContext.owner}/${repoContext.repo}/issues?state=${encodeURIComponent(state)}`;
    const result = await githubRequest('GET', endpoint, token);

    return result.ok
      ? ok(action, result.payload, { status: result.status, endpoint: result.endpoint })
      : error(action, 'GitHub API error.', { status: result.status, endpoint: result.endpoint, payload: result.payload });
  }

  if (action === 'create_pull_request') {
    const repoContext = buildRepoContext(params);
    if (!repoContext.ok) return error(action, repoContext.message);

    const title = String(params.title || '').trim();
    const body = String(params.body || '').trim();
    const head = String(params.head || '').trim();
    const base = String(params.base || 'main').trim();

    if (!title || !head || !base) {
      return error(action, 'title, head, and base are required for create_pull_request.');
    }

    const endpoint = `/repos/${repoContext.owner}/${repoContext.repo}/pulls`;
    const result = await githubRequest('POST', endpoint, token, { title, body, head, base });

    return result.ok
      ? ok(action, result.payload, { status: result.status, endpoint: result.endpoint })
      : error(action, 'GitHub API error.', { status: result.status, endpoint: result.endpoint, payload: result.payload });
  }

  return error(action || 'unknown', 'Unsupported action. Use get_user, list_issues, create_pull_request.');
};
