# Gateway Security Review (Data Flow & File Access)

## Scope
- HTTP ingress routes in `gateway/server.ts`
- Inference routing (`anythingllm` / `ollama`)
- UI file serving (`/approval-ui`)
- Body parsing and outbound calls

## Findings and hardening status

### 1) Inference route metadata exposure
- Risk: leaking internal network coordinates to UI clients.
- Mitigation: `/api/inference/routes` no longer returns Ollama `base_url`; only availability + reason + model.

### 2) Request body abuse (DoS)
- Risk: unbounded body accumulation in `readBody` could cause memory pressure.
- Mitigation: added `MAX_BODY_BYTES` cap (default 1 MiB), request is terminated when exceeded.

### 3) Error leakage
- Risk: raw backend error text may expose internals.
- Mitigation: `/api/agent/command` now sanitizes public errors and logs internal details server-side.

### 4) Outbound Ollama call robustness
- Risk: long-hanging upstream requests can block workers and degrade service.
- Mitigation: added timeout (`OLLAMA_TIMEOUT_MS`, default 12000) with abort controller.

### 5) File serving path
- Current behavior: serves only fixed file `gateway/web/approval_ui/index.html` via resolved absolute path.
- Assessment: no user-controlled file path parameter; traversal risk low.

## Recommended next steps
1. Add authn/authz to control APIs before exposing beyond trusted network.
2. Add rate limiting for `/api/agent/command` and ingress routes.
3. Add audit log sink for inference path selection and failures.
4. Validate/sanitize all webhook payload sizes early at reverse proxy layer as well.

## Config knobs
- `MAX_BODY_BYTES` (default `1048576`)
- `OLLAMA_TIMEOUT_MS` (default `12000`)
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
