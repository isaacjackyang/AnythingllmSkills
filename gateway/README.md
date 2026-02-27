# Gateway 深入說明（給新手，但細節到可上線）

> Gateway 是這個 repo 的執行核心。
> 你可以把它視為：**通道入口 + AI orchestration + 安全治理 + 任務控制 + 審計觀測**。

---

## 1. Gateway 在架構中的定位

Gateway 做的事情不是「替代 LLM」，而是把 LLM 的能力包進可治理流程：

1. 接收通道請求（Telegram / LINE / Web UI）。
2. 標準化事件結構（sender、conversation、workspace、agent、trace_id）。
3. 呼叫 AnythingLLM client 取得提案與回覆。
4. 套用 policy 與控制狀態（agent control / channel control）。
5. 分派工具與任務（含 queue job + task runner）。
6. 回傳結果並保留可追蹤資訊。

---

## 2. 目錄導覽（以目前程式碼為準）

- `server.ts`：HTTP server 與所有 API/ingress 路由。
- `connectors/telegram`, `connectors/line`：訊息平台轉換與 reply 邏輯。
- `core/router.ts`：核心事件路由協調。
- `core/anythingllm_client.ts`：對 AnythingLLM API 的封裝。
- `core/policy/`：規則與角色層。
- `core/tools/`：工具能力（shell/http/db/queue_job）。
- `core/tasks/`：任務資料存取。
- `core/lifecycle.ts`：心跳與生命週期狀態。
- `workers/job_runner.ts`：背景任務輪詢執行。
- `web/approval_ui/`：控制台前端靜態頁。

> 注意：`connectors/discord`、`connectors/slack` 有檔案，但目前 `server.ts` 實際啟用的是 telegram/line/web_ui 流程。

---

## 3. 啟動前環境要求

```powershell
node -v
npm -v
npx -v
```

建議 Node.js >= 20。

必要環境變數（主要在 `.env.gateway`）：

- `PORT`（預設 8787）
- `ANYTHINGLLM_BASE_URL`（預設 `http://localhost:3001`）
- `ANYTHINGLLM_API_KEY`（空值會導致 brain call 失敗）
- `DEFAULT_WORKSPACE`
- `DEFAULT_AGENT`
- （可選）`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
- （可選）`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`
- （可選）`HEARTBEAT_INTERVAL_MS`, `TASK_RUNNER_INTERVAL_MS`

---

## 4. 標準啟動流程（推薦）

### 4.1 初始化

```powershell
.\scripts\bootstrap_gateway.ps1
```

> `bootstrap_gateway.ps1` 現在會一併檢查/安裝 LanceDB 依賴（`lancedb`, `pyarrow`）；若只想跳過可加 `-SkipLanceDb`。

### 4.2（可選）手動重跑依賴初始化（LanceDB + Python 套件）

```powershell
node scripts/init_gateway_env.mjs
```

> 會檢查 `node/npm/python3/pip` 並嘗試安裝 `lancedb`、`pyarrow`（通常僅在你要重跑時才需要）。

### 4.3 檢查/修復

```powershell
.\check_and_fix_gateway.ps1 -NoStart
```

### 4.4 正式啟動

```powershell
.\scripts\start_gateway.ps1
```

---

## 5. 啟動後 API 驗證清單

先跑健康狀態：

```powershell
Invoke-RestMethod http://localhost:8787/healthz
Invoke-RestMethod http://localhost:8787/lifecycle
```

再看控制面：

```powershell
Invoke-RestMethod http://localhost:8787/api/agent/control
Invoke-RestMethod http://localhost:8787/api/channels
```

---

## 6. API 一覽（依 server.ts）

### UI / 健康 / lifecycle
- `GET /approval-ui`
- `GET /healthz`
- `GET /lifecycle`
- `POST /lifecycle/soul`

### 控制面
- `GET /api/agent/control`
- `GET /api/inference/routes`（回傳 anythingllm/ollama 路徑可用性與模型資訊，並同步回報 Ollama 可達性檢查結果）
- `POST /api/agent/control`（`start|pause|resume|stop`）
- `GET /api/channels`
- `GET /api/memory/files`（列出可檢視的記憶 Markdown 檔案）
- `GET /api/memory/file?path=...`（讀取指定記憶檔內容）
- `GET /api/memory/workflows`（列出可執行固定流程）
- `POST /api/memory/workflows/run`（執行固定流程：microsync / daily-wrapup / weekly-compound）
- `GET /api/memory/architecture`（回傳 LDB 七層混合檢索架構快照）
- `POST /api/memory/learn`（手動寫入 Agent 經驗：踩坑/方法論/決策）
- `GET /api/memory/search?q=...&limit=`（走 LanceDB 搜尋 Agent 長期記憶）
- `POST /api/system/init`（執行初始化檢查與依賴安裝）
- `POST /api/channels`（channel: `telegram|line|web_ui` + `enabled: boolean`）

### Web command
- `POST /api/agent/command`
  - `text: string`（可選；若使用 `confirm_token` 可省略）
  - `confirm_token: string`（可選；用於二次確認執行）
  - `path: "anythingllm" | "ollama"`（選填，預設 `anythingllm`）
  - 若 `web_ui` channel disabled，回 `503`。
  - 當 `path="ollama"` 時，直接呼叫 Ollama `/api/generate`（可用 `OLLAMA_BASE_URL`、`OLLAMA_MODEL` 設定）。

### Ingress
- `POST /ingress/telegram`
  - 驗證 `x-telegram-bot-api-secret-token`（若有設定 secret）
- `POST /ingress/line`
  - 驗證 `x-line-signature`

### Tasks
- `GET /api/tasks?status=&limit=`
- `GET /api/tasks/:id`
- `POST /api/tasks/:id/cancel`
- `DELETE /api/tasks/:id`
- `POST /api/tasks/run-once`

### Approvals（新增）
- `GET /api/approvals?status=&type=&limit=`
- `POST /api/approvals/:id/approve`
- `POST /api/approvals/:id/reject`

---

## 7. 新手實戰：先只測 Web UI 通道

1. 啟動 gateway。
2. 打開 `http://localhost:8787/approval-ui`。
3. 確認 `/api/channels` 的 `web_ui` 是 enabled。
4. 送 `POST /api/agent/command` 測試文字。
5. 回傳應含 `trace_id`，可用於後續 log 對帳。

這條路徑穩定後，再接 Telegram/LINE。


## 7.1 風險分級與確認流程（新增）

- low 風險：自動執行。
- medium 風險：回傳 dry-run + `confirm_token`，需再次送 `/api/agent/command` 並帶 token。
- high 風險：建立 pending approval，需 approver 呼叫 `/api/approvals/:id/approve`。
- **刪除/格式化（底線）**：永遠啟用「程式雙重確認」：
  1) approver 先審批 `/api/approvals/:id/approve`
  2) 使用者再帶 `confirm_token` 呼叫 `/api/agent/command`
  未通過任一步驟不得執行。

---

## 8. 常見故障與對應判斷

- `healthz != ok`
  - 優先看 gateway 是否啟動後立刻退出。
- `web_ui command` 回 503
  - 檢查 `POST /api/channels` 是否把 `web_ui` 關掉。
- Telegram 401
  - 檢查 webhook secret header。
- LINE 401
  - 檢查簽章驗證與原始 body 是否被中途改寫。
- command 看似成功但沒回覆
  - 檢查 AnythingLLM API key 與 base URL。

---

## 9. 建議營運習慣

- 每次異常保留 `trace_id`。
- 先看健康與控制面，再看 connector。
- 任何 channel 問題都先確認 enable 狀態。
- 把 `.env.gateway` 管理納入部署流程（避免人工漏填）。

---

## 10. 記憶固定流程自動化

- 固定流程腳本：`scripts/memory_workflow.js`
- UI 可直接觸發：`POST /api/memory/workflows/run`
- 建議預設先用 dry-run，確認輸出後再正式執行。

## 10.1 Agent 自我進化記憶（新增）

- 每次工具執行成功：自動寫入「方法論」條目（methodology）。
- 每次工具執行失敗：自動寫入「踩坑」條目（pitfall）。
- 寫入採雙軌同步：
  1. `LanceDB`（主查詢）
  2. `memory/recent/agent-learning.md`（給 UI 直接檢視）
- 可用 `POST /api/memory/learn` 手動補充高價值經驗。

## 11. 資安檢視與建議

- 安全檢視文件：`gateway/SECURITY_REVIEW.md`
- 新增保護：
  - `MAX_BODY_BYTES`（限制 request body，預設 1MiB）
  - `OLLAMA_TIMEOUT_MS`（限制 Ollama 呼叫逾時，預設 12s）
  - `MAX_MEMORY_FILE_READ_BYTES`（單次記憶檔讀取上限，預設 256KiB）
  - `/api/inference/routes` 不再回傳 Ollama base URL

## 12. 一句總結

Gateway 的核心價值是把 AI 執行變成「可觀測、可控、可回放」的服務，不只是聊天 API 代理。
