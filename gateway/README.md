# Gateway Skeleton (AnythingLLM as Brain)

This Gateway follows the requested control-plane split:
- AnythingLLM = reasoning brain (agents + skills).
- Gateway = execution authority (policy + tool runner + audit).

## Pipeline implemented

`Telegram -> Gateway(Event) -> Brain Proposal(JSON) -> Policy -> Tool Runner -> Brain Summary -> Telegram Reply`

## Implemented now

- `connectors/telegram/connector.ts`
  - Parses Telegram webhook updates into canonical `Event`.
  - Supports routing override via message format:
    - `/route workspace=<name> agent=<name> <message>`
  - Sends replies through Telegram Bot API.
- `core/anythingllm_client.ts`
  - Calls AnythingLLM Developer API (`/api/v1/workspace/:workspace/chat`).
  - `propose()`: enforces proposal-only prompt and parses JSON output.
  - `summarize()`: summarizes tool results for channel reply.
- `server.ts`
  - Exposes `POST /ingress/telegram`, `GET /healthz`, `GET /lifecycle`, and `POST /lifecycle/soul`.
  - Wires connector + router + AnythingLLM client end-to-end.

Core files:
- `core/event.ts`: canonical Event schema with `trace_id`.
- `core/lifecycle.ts`: process heartbeat + soul (instance identity) runtime state.
- `core/router.ts`: end-to-end orchestration + idempotency guard.
- `core/proposals/schema.ts`: strict Proposal contract.
- `core/policy/rules.ts`: auto / need-approval / reject decisions.
- `core/tools/http_request.ts`: allowlist + timeout baseline.
- `core/audit/*`: traceable stage logging.

## Environment variables

- `PORT` (default `8787`)
- `TELEGRAM_BOT_TOKEN`
- `ANYTHINGLLM_BASE_URL` (default `http://localhost:3001`)
- `ANYTHINGLLM_API_KEY`
- `HEARTBEAT_INTERVAL_MS` (default `10000`, invalid/non-positive values fallback to default)
- `DEFAULT_WORKSPACE` (default `maiecho-prod`)
- `DEFAULT_AGENT` (default `ops-agent`)
- `SOUL_ROLE` (default `gateway`)

## Next steps by phase

1. Implement durable storage for proposals/audit.
2. Add approval API + UI action callbacks for high-risk proposals.
3. Add scheduler/webhook ingress and shared event path.
4. Fill `discord/slack/line` connectors with production auth + identity mapping.


## Lifecycle / Heartbeat / Soul

- Heartbeat: in-memory ticker updates `sequence` and `last_beat_at` every `HEARTBEAT_INTERVAL_MS`.
- Soul: immutable process identity (`instance_id`, `pid`, `hostname`, `started_at`).
- `GET /healthz`: lightweight probe with `ok`, `status`, and `heartbeat_age_ms`.
- `GET /lifecycle`: full lifecycle snapshot including `heartbeat` and `soul`.
- `POST /lifecycle/soul`: updates mutable soul fields (`role`, `node_env`) and increments `revision`.
- Status becomes `stale` when heartbeat age exceeds `interval * 3` (returns HTTP 503).
