function nowIso() {
  return new Date().toISOString();
}

function ok(action, data, audit = {}) {
  return {
    ok: true,
    action,
    data,
    audit: { timestamp: nowIso(), ...audit }
  };
}

function error(action, message, detail = {}) {
  return {
    ok: false,
    action,
    error: { message, ...detail },
    audit: { timestamp: nowIso() }
  };
}

module.exports = {
  ok,
  error
};
