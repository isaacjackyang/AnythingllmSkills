# LDB Memory Architecture (LanceDB-based)

## Goals
- Give the assistant long-term, reusable memory.
- Keep memory quality high through hybrid retrieval + rerank + dedupe.
- Isolate memory by agent scope while still allowing shared knowledge pools.
- Make memory visible to users via external markdown sync.

## Retrieval Pipeline (7 layers)
1. Vector semantic retrieval.
2. BM25 full-text retrieval.
3. Hybrid fusion.
4. Multi-stage rerank (6 layers scoring stack).
5. MMR diversity filtering.
6. Adaptive noise filtering.
7. Scope isolation (agent/private/shared).

## Operational Rules
- Confirmed outcomes only are written into long-term memory.
- Rulebook (鐵律) can drive auto-capture after successful fixes.
- Manual memory capture API remains available.
- Every learning write is synced to markdown for UI visibility.

## Runtime integration in Gateway
- LanceDB bridge script: `scripts/lancedb_memory_bridge.py`.
- Auto-init script: `scripts/init_gateway_env.mjs` (checks deps and installs `lancedb`/`pyarrow`).
- Memory write API: `POST /api/memory/learn`.
- Memory search API: `GET /api/memory/search?q=...&limit=`.
- Architecture snapshot API: `GET /api/memory/architecture`.

## External file sync
- Agent learning log: `memory/recent/agent-learning.md`.
- Purpose: users can inspect learned pitfalls/methodologies directly from UI file browser.
