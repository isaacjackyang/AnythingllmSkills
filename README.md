# OpenClaw-like Blueprint (AnythingLLM MVP)

這版改成更接近 OpenClaw 的技能風格：

- **action-based 介面**：每個 skill 都用明確 `action`
- **嚴格 schema**：`additionalProperties: false`
- **可觀測輸出**：統一 `ok/action/data(or error)/audit`
- **最小可重現流程**：plan → execute → report

- **一致命名**：plan 輸出欄位需和後續 block 引用完全一致，避免 hidden mismatch
- **審計欄位**：flow logs 內加入 `audit:{flow,version}`，方便追蹤與 debug


## Skill 開發新範式（Single Binary CLI First）

本 repo 的 Skill 規範已改為：

- Skill 僅負責路由與驗證
- 所有副作用集中到自有單一 Rust/Go CLI
- 禁止 on-demand Python/JS/TS 腳本
- 禁止依賴未審核第三方 Skill Hub

完整規範見 `SKILL.md`。

## Skills

### 1) `ps_run_safe`
- action: `run`
- 只允許 `git/node/python/npm/pnpm`
- 擋掉高風險 token（`;`, `|`, `&`, `` ` `` 等）
- 回傳結構化執行結果（exitCode/stdout/stderr/duration）

### 2) `file_read_sandbox`
- action: `read_text`
- 僅允許讀取 `C:\agent_sandbox` 內檔案
- 支援 `maxBytes`

### 3) `file_write_sandbox`
- action: `write_text` / `append_text`
- 僅允許寫入 `C:\agent_sandbox` 內檔案
- 自動建目錄

### 4) `git_api`（可選）
- action: `get_user` / `list_issues` / `create_pull_request`
- 使用 `GITHUB_TOKEN`
- 限制 owner/repo 格式，避免任意 endpoint

## Flows

### `flows/BrowserTaskFlow.blueprint.json`
- LLM 先產生固定 JSON 計畫
- Browser tool 依步驟執行
- 用 `file_write_sandbox(action=write_text)` 存證據

### `flows/GitHubTaskFlow.blueprint.json`
- LLM 先產生 PR 計畫 JSON
- 透過 `git_api` 執行 `list_issues` + `create_pull_request`
- 用 `file_write_sandbox(action=write_text)` 記錄操作

## 建議落地順序

1. 先建立 `C:\agent_sandbox`
2. 先跑通 `file_write_sandbox`/`file_read_sandbox`
3. 再啟用 `ps_run_safe`
4. 再接 `git_api` 與 GitHub flow
5. 最後接 browser flow

## Debug 原則

- 一律看 logs，不靠感覺
- skill 輸出必須有 `ok/action/audit`
- flow 執行完要在 `C:\agent_sandbox\logs\*.json` 留痕



## 相容性更新（AnythingLLM v1.11+）

- 所有 skills 的 `plugin.json` 已統一改為 `entrypoint.file` 格式。
- 所有 `handler.js` 已統一提供 `module.exports = { handler }`，並使用 `handler({ input, logger })` 介面。
- 參數驗證改由各 skill 內部執行邏輯檢查，維持既有安全規則。

---

## Gateway/Brain 實作骨架（新增）

已新增 `gateway/` 與 `anythingllm/` 雙側骨架，對應你指定的 OpenClaw-like 拆分：

- `gateway/connectors/*`：多通道連接器模板
- `gateway/core/event.ts`：統一 Event 規格 + `trace_id`
- `gateway/core/router.ts`：主流程編排（proposal + policy + tool runner + reply）
- `gateway/core/policy/*`：角色能力與風險決策
- `gateway/core/proposals/*`：Proposal schema + idempotency store
- `gateway/core/tools/*`：`http_request` / `queue_job` / `db_query` / `shell_command` 基礎實作
- `gateway/core/audit/*`：event→decision→execution 全鏈路稽核
- `gateway/workers/job_runner.ts`：背景工作入口
- `gateway/web/approval_ui/README.md`：審批控制面
- `anythingllm/workspaces|agents|skills`：Brain 側掛載點

目前已補上 Telegram connector 與 AnythingLLM API client，並提供 `gateway/server.ts` 直接串起第一條生命線。

## 安裝、設定、使用（Gateway + AnythingLLM 詳細指南）

> 目標：讓你可以把目前專案直接跑成
> `Telegram -> Gateway -> AnythingLLM(Proposal) -> Policy -> Tool Runner -> AnythingLLM(Reply) -> Telegram`

### 0) 先決條件

- Node.js 20+（需要內建 `fetch`）
- 一個可用的 AnythingLLM 實例（可透過 `/api/docs` 驗證 Developer API）
- 一個 Telegram Bot（拿到 bot token）
- 一個可被 Telegram 打到的 HTTPS 網址（例如 Cloudflare Tunnel / ngrok / 正式網域）

---

### 1) 專案結構重點

- Gateway 入口：`gateway/server.ts`
- Telegram Connector：`gateway/connectors/telegram/connector.ts`
- Brain Client（AnythingLLM API）：`gateway/core/anythingllm_client.ts`
- Pipeline Orchestrator：`gateway/core/router.ts`

---

### 2) 安裝與啟動

目前 repo 沒有綁死 package manager，你可以用最輕量方式啟動 TypeScript：

1. 安裝執行器（擇一）
   - `npm i -D tsx typescript @types/node`
   - 或使用你自己的 ts-node/既有 build pipeline

2. 啟動 Gateway

```bash
npx tsx gateway/server.ts
```

預設會監聽：`http://localhost:8787`

健康檢查：

```bash
curl http://localhost:8787/healthz
```

Lifecycle（含 heartbeat + soul）：

```bash
curl http://localhost:8787/lifecycle
```

更新靈魂可變欄位（role/node_env）：

```bash
curl -X POST http://localhost:8787/lifecycle/soul \
  -H "Content-Type: application/json" \
  -d '{"role":"ops","node_env":"production"}'
```

應回傳 JSON，例如：`{"ok":true,"status":"ok","heartbeat_age_ms":12}`

---

### 3) 環境變數設定

`gateway/server.ts` 會讀以下變數：

- `PORT`：Gateway 監聽埠（預設 `8787`）
- `TELEGRAM_BOT_TOKEN`：Telegram bot token
- `ANYTHINGLLM_BASE_URL`：AnythingLLM base URL（預設 `http://localhost:3001`）
- `ANYTHINGLLM_API_KEY`：AnythingLLM API Key（Developer API）
- `DEFAULT_WORKSPACE`：預設 workspace（預設 `maiecho-prod`）
- `DEFAULT_AGENT`：預設 agent（預設 `ops-agent`）
- `HEARTBEAT_INTERVAL_MS`：心跳週期毫秒（預設 `10000`）
- `SOUL_ROLE`：靈魂角色標籤（預設 `gateway`）

範例（Linux/macOS）：

```bash
export PORT=8787
export TELEGRAM_BOT_TOKEN="123456:abc..."
export ANYTHINGLLM_BASE_URL="http://localhost:3001"
export ANYTHINGLLM_API_KEY="sk-..."
export DEFAULT_WORKSPACE="maiecho-prod"
export DEFAULT_AGENT="ops-agent"

npx tsx gateway/server.ts
```

---

### 4) Telegram Webhook 設定

Gateway ingress endpoint：

- `POST /ingress/telegram`

假設你對外網域是 `https://gateway.example.com`：

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://gateway.example.com/ingress/telegram"}'
```

查詢 webhook：

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

---

### 5) 路由到指定 workspace/agent 的用法

Telegram 訊息預設會走：
- workspace = `DEFAULT_WORKSPACE`
- agent = `DEFAULT_AGENT`

如需臨時切換，訊息可用：

```text
/route workspace=maiecho-prod agent=ops-agent 幫我查今天 API 錯誤摘要
```

Connector 會解析前綴後，把剩餘文字作為真正 query。

---

### 6) AnythingLLM 端建議設定（重要）

你的 agent/system prompt 請明確要求：

1. 不可直接執行副作用（不要直接 call 高權限 API）
2. 只能輸出 Proposal JSON（`tool_proposal`）
3. 風險等級必填（`low|medium|high`）
4. 必填 `idempotency_key`

建議模板：

```json
{
  "trace_id": "<uuid>",
  "type": "tool_proposal",
  "tool": "http_request",
  "risk": "medium",
  "inputs": {"url":"https://api.internal.local/...","method":"POST","body":{}},
  "reason": "...",
  "idempotency_key": "..."
}
```

---

### 7) 端到端驗收流程（Phase 1 最小可上線）

1. 啟 Gateway（`GET /healthz` status = ok）
2. 設定 Telegram webhook 指向 `/ingress/telegram`
3. 在 Telegram 對 bot 發送訊息
4. Gateway 轉 Event 並呼叫 AnythingLLM 產生 proposal
5. Policy 判斷：
   - low/medium（有權）=> auto execute
   - high => `need-approval`
6. Tool Runner 執行後，結果回灌 AnythingLLM summarize
7. Connector 回傳最終訊息到 Telegram

---

### 8) 常見錯誤排查

1. **`ANYTHINGLLM_API_KEY is empty`**
   - 代表忘記設環境變數，Brain 呼叫一定失敗。

2. **Telegram 回 `sendMessage failed`**
   - 檢查 token 是否有效、chat_id 是否存在、bot 是否有該對話權限。

3. **AnythingLLM 回 4xx/5xx**
   - 檢查 `ANYTHINGLLM_BASE_URL`、workspace 名稱、API key 權限。

4. **Proposal 解析失敗（JSON.parse error）**
   - 代表 agent 回了 prose/markdown，需加強 system prompt 嚴格只回 JSON。

5. **`duplicate proposal blocked by idempotency_key`**
   - 表示重送事件撞到同 key；需檢查 idempotency key 生成策略。

---

### 9) 生產環境建議（你接下來最該做）

- 將 proposal/audit 改成持久化儲存（DB/Redis），不要只用記憶體
- 補 `approval` API 與控制面 UI（高風險動作必經人審）
- 為 `http_request` 補 retry policy、更細 allowlist、簽章/來源驗證
- 補 Discord/Slack/LINE connectors（含 identity mapping）
- 加入 metrics + tracing（成功率、延遲、失敗分類）


## 2D 照片人物動作模擬範例

若你目前只需要「2D 模擬」，可直接打開：

- `examples/photo-2d-motion.html`

這個範例提供：

- 上傳照片做背景
- 疊加 2D 骨架
- 內建揮手動畫（右手）

快速啟動（任一靜態伺服器）：

```bash
python3 -m http.server 8080
# 然後開啟 http://localhost:8080/examples/photo-2d-motion.html
```
