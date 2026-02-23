const SAFE_ENDPOINT = /^\/(repos|issues|user|orgs|search)\/[a-zA-Z0-9._\/-]*$/;

module.exports = async function execute(params = {}) {
  const method = String(params.method || 'GET').trim().toUpperCase();
  const endpoint = String(params.endpoint || '').trim();
  const body = params.body && typeof params.body === 'object' ? params.body : undefined;

  if (!endpoint) {
    return { ok: false, message: 'Missing required parameter: endpoint' };
  }

  if (!SAFE_ENDPOINT.test(endpoint)) {
    return { ok: false, message: `Endpoint blocked by policy: ${endpoint}` };
  }

  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    return { ok: false, message: `Method not allowed: ${method}` };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { ok: false, message: 'Missing GITHUB_TOKEN environment variable.' };
  }

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
    // keep raw text
  }

  return {
    ok: response.ok,
    status: response.status,
    endpoint,
    method,
    payload
  };
};
