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
  - Exposes `POST /ingress/telegram` and `GET /healthz`.
  - Wires connector + router + AnythingLLM client end-to-end.

Core files:
- `core/event.ts`: canonical Event schema with `trace_id`.
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
- `DEFAULT_WORKSPACE` (default `maiecho-prod`)
- `DEFAULT_AGENT` (default `ops-agent`)

## Next steps by phase

1. Implement durable storage for proposals/audit.
2. Add approval API + UI action callbacks for high-risk proposals.
3. Add scheduler/webhook ingress and shared event path.
4. Fill `discord/slack/line` connectors with production auth + identity mapping.
