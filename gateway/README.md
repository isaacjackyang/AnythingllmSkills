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
6. 以 Agent Registry 管理多 Agent 設定（模型 / soul / 任務板 / 記憶命名空間）。
7. 回傳結果並保留可追蹤資訊。

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
- （可選）`UPSTREAM_RETRY_MAX_ATTEMPTS`（預設 2，代表最多嘗試 2 次，含第一次）
- （可選）`UPSTREAM_RETRY_BASE_DELAY_MS`（預設 200ms，線性退避基準）
- 以上所有 `*_MS` / `*_BYTES` 與 `PORT` 若填入非正整數，Gateway 會在啟動時警告並自動回退到安全預設值（避免錯誤設定造成啟動崩潰）。

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


### 4.4 啟動後契約煙霧測試（新增）

```bash
node scripts/smoke_gateway_contract.mjs --base-url http://localhost:8787
```

用途：快速驗證 `healthz/lifecycle/channels/inference routes/tasks` 的基礎 API 合約是否穩定。


### 4.5 Release 檢查表（新增）

```bash
node scripts/release_checklist.mjs --base-url http://localhost:8787
```

若你在 CI / pre-release 階段要求 live smoke 必須成功，請加：

```bash
node scripts/release_checklist.mjs --base-url http://localhost:8787 --require-live
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
- `GET /api/agents`（列出主 Agent + 子 Agent）
- `POST /api/agents`（新增 Agent：name/model/soul/communication_mode）
- `PATCH /api/agents/:id`（更新 Agent profile）
- `GET /api/agent/communications`（查看 Agent 間通信拓樸）
- `GET /api/agent/control?agent_id=`
- `GET /api/inference/routes`（回傳 anythingllm/ollama 路徑可用性與模型資訊，並同步回報 Ollama 可達性檢查結果）
- `POST /api/agent/control`（`start|pause|resume|stop`，可帶 `agent_id`）
- `GET /api/channels`
- `GET /api/memory/files`（列出可檢視的記憶 Markdown 檔案）
- `GET /api/memory/file?path=...`（讀取指定記憶檔內容）
- `GET /api/memory/workflows`（列出可執行固定流程）
- `POST /api/memory/workflows/run`（執行固定流程：microsync / daily-wrapup / weekly-compound）
- `GET /api/memory/architecture`（回傳 LDB 七層混合檢索架構快照）
- `POST /api/memory/learn`（手動寫入 Agent 經驗：踩坑/方法論/決策，可帶 `agent_id`，寫入對應 memory namespace）
- `GET /api/memory/search?q=...&limit=`（走 LanceDB 搜尋 Agent 長期記憶）
- `POST /api/system/init`（執行初始化檢查與依賴安裝）
- `POST /api/channels`（channel: `telegram|line|web_ui` + `enabled: boolean`）

### Web command
- `POST /api/agent/command`（可帶 `agent_id`，讓不同 Agent 以自身 soul/model/記憶執行）
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
- `GET /api/tasks?status=&limit=&agent_id=`
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


## 8.1 多 Agent 通信與資料儲存策略（新增）

- **通信模式**
  - `hub_and_spoke`：子 Agent 只能透過主 Agent 溝通，適合集中治理與審批。
  - `direct`：Agent 可彼此直接溝通，適合協作型工作流。
- **資料儲存隔離**
  - 任務隊列使用 `agent_id` 標記（`/api/tasks?agent_id=...` 可過濾）。
  - 記憶寫入附帶 `memory_namespace`，避免不同 Agent 學習內容互相污染。
  - Agent metadata 由 `gateway/data/agent_registry.json` 持久化，便於重啟後回復拓樸。

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
- 依賴降級：AnythingLLM / Ollama 針對連線錯誤與 408/429/5xx 會依設定做有限重試（retry budget）。
  - `MAX_BODY_BYTES`（限制 request body，預設 1MiB）
  - `OLLAMA_TIMEOUT_MS`（限制 Ollama 呼叫逾時，預設 12s）
  - `MAX_MEMORY_FILE_READ_BYTES`（單次記憶檔讀取上限，預設 256KiB）
  - `/api/inference/routes` 不再回傳 Ollama base URL


## 12. 錯誤碼（error_code）與 Runbook 對照（新增）

部分 API 失敗回應現在會附帶 `error_code`（與 `error` 訊息並存，維持向後相容）：

| error_code | 說明 | 建議處理（Runbook） |
|---|---|---|
| `INVALID_INPUT` | 請求參數缺漏或格式錯誤 | 先檢查 request payload/query；再比對 API 文件必填欄位。 |
| `REQUEST_BODY_TOO_LARGE` | body 超過 `MAX_BODY_BYTES` | 減小請求內容或調整 `MAX_BODY_BYTES`。 |
| `NOT_FOUND` | 指定資源不存在（如記憶檔案） | 確認 path/id 正確，先查列表再讀取明細。 |
| `JOB_LOCKED` | 同一 workflow 正在執行中 | 稍後重試，或先確認目前執行中的 job 狀態。 |
| `UPSTREAM_UNAVAILABLE` | 上游服務（AnythingLLM/Ollama）不可達 | 檢查 base URL、API key、網路連線與服務健康狀態。 |
| `AGENT_COMMAND_FAILED` | agent command 流程失敗（通用） | 先看 `error` 文案，再對照 route/path/channel 設定。 |
| `SYSTEM_INIT_FAILED` | 系統初始化流程失敗 | 重跑 `/api/system/init` 並檢查 node/python/pip 依賴。 |
| `MEMORY_FILE_READ_FAILED` | 記憶檔讀取失敗（通用） | 檢查檔案權限、路徑、檔案大小與副檔名。 |
| `MEMORY_WORKFLOW_FAILED` | 固定工作流程執行失敗（通用） | 檢查 workflow name 與 script 執行環境。 |
| `MEMORY_WRITE_FAILED` | 記憶寫入失敗（通用） | 檢查 memory namespace、存取權限、LanceDB 狀態。 |
| `MEMORY_SEARCH_FAILED` | 記憶搜尋失敗（通用） | 檢查 LanceDB 相依、query 參數與後端連線。 |

> 建議 on-call 流程：先看 `error_code` 判斷分類，再看 `error` 文案定位細節。

---

## 13. 一句總結

Gateway 的核心價值是把 AI 執行變成「可觀測、可控、可回放」的服務，不只是聊天 API 代理。
