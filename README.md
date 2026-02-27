# AnythingLLM Skills 專案總覽（新手視角 + 專家細節）

> 你可以把這個 repo 想成一個「可控的 AI 執行中樞」。
> 它不是只有 prompt，而是把 **通道接入、策略控管、工具執行、任務排程、審計追蹤** 都做成可落地的工程結構。

---

## 1) 這個 repo 實際上有什麼？

目前主要由 4 個可運作區塊構成：

- `gateway/`：核心後端（Node + TypeScript），負責事件路由、policy、tasks、channel control。
- `gateway/web/approval_ui/`：Gateway 內建的審批/控制 UI（靜態頁）。
- `anythingllm-skills/local-file-search-open/`：可直接放入 AnythingLLM 的 skill 範例（本機檔案搜尋 + 選擇性開啟 Explorer）。
- `mcp-open-in-explorer/`：Windows-only MCP server，只做 `open_in_explorer({ path })`。

另外：

- `anythingllm/` 目前是預留掛載目錄說明，不是完整 AnythingLLM 原始碼。
- `flows/*.blueprint.json` 是流程藍圖範例。

---

## 2) 架構資料流（請先理解這段）

以 `Gateway` 為主的請求流程：

1. 外部通道進入（`/ingress/telegram`、`/ingress/line`、或 UI 走 `/api/agent/command`）。
2. Gateway 建立標準化事件（含 `trace_id`）並記錄 channel activity。
3. Gateway 呼叫 AnythingLLM client 產生 proposal / 回覆內容。
4. Router 套用 policy（允許 / 拒絕 / 待審批）。
5. 工具層（shell/http/db/queue）或 task runner 執行可執行行為。
6. 回覆透過原通道送出（telegram/line）或回傳給 web UI。

**關鍵觀念**：
- AnythingLLM 負責「思考與文字」。
- Gateway 負責「治理與執行控制」。

---

## 3) 先決條件（不先過這關，後面都白做）

- Node.js `>= 20`
- npm / npx
- PowerShell（目前啟動與 bootstrap 主要腳本是 `.ps1`）
- 可用的 AnythingLLM API endpoint + API Key

建議先跑：

```powershell
node -v
npm -v
npx -v
```

---

## 4) 建議第一次操作順序（成功率最高）

### Step 1: 產生基礎環境檔與啟動腳本

```powershell
.\scripts\bootstrap_gateway.ps1
```

這會：
- 檢查 `node/npm/npx`。
- 在缺少時建立 `package.json`。
- 安裝本 repo Gateway 需要的本機 dev tooling（`typescript`, `tsx`, `@types/node`）。
- 建立 `.env.gateway`（若不存在）。
- 建立 `scripts/start_gateway.ps1`（若不存在）。

### Step 2: 先做檢查修復，不急著啟動

```powershell
.\check_and_fix_gateway.ps1 -NoStart
```

這會檢查：
- 指令是否存在（`node/npm/npx/powershell`）
- bootstrap 必要產物是否齊全
- `.env.gateway` 的 `ANYTHINGLLM_API_KEY`、`ANYTHINGLLM_BASE_URL`
- `npx tsx` 能否執行

### Step 3: 啟動 Gateway

```powershell
.\scripts\start_gateway.ps1
```

啟動腳本行為（目前實作）：
1. 讀取 `.env.gateway` 注入目前 process 環境。
2. 背景啟動 `npx tsx gateway/server.ts`。
3. 輪詢 `/healthz`（預設等 20 秒）。
4. 自動嘗試開 `http://localhost:8787/approval-ui`（失敗再 fallback 本地 html）。

---

## 5) 啟動後最小驗證（請照順序）

```powershell
Invoke-RestMethod http://localhost:8787/healthz
Invoke-RestMethod http://localhost:8787/lifecycle
Invoke-RestMethod http://localhost:8787/api/channels
```

若 `healthz` 不過，不要先追 Telegram/LINE webhook。

---

## 6) 目前 Gateway 主要 API（精簡版）

- `GET /healthz`
- `GET /lifecycle`
- `POST /lifecycle/soul`
- `GET/POST /api/agent/control`
- `GET/POST /api/channels`
- `POST /api/agent/command`
- `POST /ingress/telegram`
- `POST /ingress/line`
- `GET /api/tasks`
- `GET /api/tasks/:id`
- `POST /api/tasks/:id/cancel`
- `DELETE /api/tasks/:id`
- `POST /api/tasks/run-once`

---

## 7) 新手最常踩的坑（真實高頻）

1. `.env.gateway` 有值，但其實未被啟動流程載入。
2. `ANYTHINGLLM_BASE_URL` 指到錯環境（例如 staging/prod 混用）。
3. `ANYTHINGLLM_API_KEY` 空值或權限不足。
4. `web_ui` channel 被 disable，造成 `/api/agent/command` 回 503。
5. 直接測 webhook，卻連本機 `healthz` 都還沒過。

---

## 8) 你接下來該讀哪份文件

- 想深入 Gateway：`gateway/README.md`
- 想理解控制台 UI：`gateway/web/approval_ui/README.md`
- 想用本機 skill：`anythingllm-skills/local-file-search-open/README.md`
- 想用 Windows MCP 開檔定位：`mcp-open-in-explorer/README.md`
- 想看 Brain 掛載定位：`anythingllm/README.md`

---

## 9) 一句話收斂

先把 **Gateway 可啟動、可健康檢查、可送 command** 這三件事做穩，再往 webhook 與多工具擴充，會省下大量排錯時間。

---

## 10) Agent 記憶系統（四層拆分版）

已新增可直接落地的記憶結構與規格：

- 主索引：`MEMORY.md`
- 暖記憶：`memory/`（每日、recent、projects、archive）
- 冷記憶：`second-brain/`（summaries、research、devlogs、specs）
- 規格（含時序/效能治理）：`second-brain/specs/system-memory-architecture.md`
- 排程 prompt：`second-brain/specs/scheduler-prompts.md`
- OpenClaw 對齊差異分析：`second-brain/specs/openclaw-gap-analysis.md`

建議先跑最小版本（MEMORY + daily memory + summaries），再擴充到 archive/research 與 QMD。

### 工作流一致性補充
- 查詢效能建議採「先 warm 後 cold」分層查詢，避免每次全庫搜尋。
- weekly compound 與 daily wrap-up 不可同時跑，避免並發寫入。
- `microSync` 只寫 `memory/YYYY-MM-DD.md`。
- `daily wrap-up` 只寫 `second-brain/summaries/`。
- `weekly compound` 才能重寫 `MEMORY.md` 與下沉 archive。
- 所有決策條目建議帶 `session_id / session_path / message_range` 以便回鏈。
