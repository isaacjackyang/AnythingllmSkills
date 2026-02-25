# Gateway Skeleton (AnythingLLM as Brain)

This Gateway follows the requested control-plane split:
- AnythingLLM = reasoning brain (agents + skills).
- Gateway = execution authority (policy + tool runner + audit).

## Pipeline implemented

`Telegram/LINE/Web UI -> Gateway(Event) -> Brain Proposal(JSON) -> Policy -> Tool Runner -> Brain Summary -> Channel Reply`

## Implemented now

- `connectors/telegram/connector.ts`
  - Parses Telegram webhook updates into canonical `Event`.
  - Supports routing override via message format:
    - `/route workspace=<name> agent=<name> <message>`
  - Sends replies through Telegram Bot API.
- `connectors/line/connector.ts`
  - Parses LINE webhook text messages into canonical `Event`.
  - Verifies `x-line-signature` (when `LINE_CHANNEL_SECRET` is configured).
  - Sends replies through LINE Messaging API reply token.
- `core/anythingllm_client.ts`
  - Calls AnythingLLM Developer API (`/api/v1/workspace/:workspace/chat`).
  - `propose()`: enforces proposal-only prompt and parses JSON output.
  - `summarize()`: summarizes tool results for channel reply.
- `server.ts`
  - Exposes `POST /ingress/telegram`, `POST /ingress/line`, `POST /api/agent/command`, `GET/POST /api/channels`, `GET /healthz`, `GET /lifecycle`, and `POST /lifecycle/soul`.
  - Wires connectors + router + AnythingLLM client end-to-end.

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
- `TELEGRAM_WEBHOOK_SECRET` (optional, recommended for webhook secret-token verification)
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET` (optional, but strongly recommended for webhook signature verification)
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
4. Fill `discord/slack` connectors with production auth + identity mapping.


## Lifecycle / Heartbeat / Soul

- Heartbeat: in-memory ticker updates `sequence` and `last_beat_at` every `HEARTBEAT_INTERVAL_MS`.
- Soul: immutable process identity (`instance_id`, `pid`, `hostname`, `started_at`).
- `GET /healthz`: lightweight probe with `ok`, `status`, and `heartbeat_age_ms`.
- `GET /lifecycle`: full lifecycle snapshot including `heartbeat` and `soul`.
- `POST /lifecycle/soul`: updates mutable soul fields (`role`, `node_env`) and increments `revision`.
- Status becomes `stale` when heartbeat age exceeds `interval * 3` (returns HTTP 503).


## LINE webhook quick setup

1. Set env:

```bash
export LINE_CHANNEL_ACCESS_TOKEN="<channel access token>"
export LINE_CHANNEL_SECRET="<channel secret>"
```

2. Point LINE webhook to:

- `POST https://<your-domain>/ingress/line`

3. Send text message to your bot; Gateway will route it to AnythingLLM and reply via `replyToken`.

---

## Web UI command endpoint

Approval UI now provides a chat input panel that sends commands to:

- `POST /api/agent/command` with body `{ "text": "..." }`

Gateway turns this into a canonical `webhook` channel `Event`, runs the same router/policy/tool pipeline, and returns `reply` for UI rendering.


### Telegram webhook secret token

If `TELEGRAM_WEBHOOK_SECRET` is set, Gateway validates `x-telegram-bot-api-secret-token` on `POST /ingress/telegram`. Invalid/missing token returns `401`.


## Channel switch API

- `GET /api/channels`: read channel enabled state (`telegram`, `line`, `web_ui`).
- `POST /api/channels`: set channel state with `{ "channel": "telegram|line|web_ui", "enabled": true|false }`.
- When disabled, corresponding ingress endpoint returns `503`.
