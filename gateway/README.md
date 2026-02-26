# Gateway 使用說明（把你當第一次碰後端的人）

> 你可以把 Gateway 想成「總調度中心」。
> 所有外部訊息、風險判斷、工具執行、審計記錄，幾乎都經過它。

---

## 1. Gateway 負責哪些事？

Gateway 主要做 6 件事：

1. 接收外部訊息（Telegram / LINE / Web UI）
2. 整理成內部事件格式（含 `trace_id`）
3. 向 AnythingLLM 要 Proposal
4. 套用 Policy（允許 / 拒絕 / 審批）
5. 呼叫 Tool Runner 執行工具
6. 把結果回傳給通道使用者

---

## 2. 目錄導覽（先看這幾個）

- `server.ts`：Gateway 入口與 HTTP 路由
- `connectors/`：通道連接器（telegram / line）
- `core/router.ts`：核心流程編排
- `core/policy/`：風險政策
- `core/tools/`：工具執行
- `core/audit/`：審計紀錄
- `workers/`：背景工作（task runner）

---

## 3. 啟動前檢查

```powershell
node -v
npm -v
npx -v
```

建議 Node.js >= 20。

此外請先確認：

- `.env.gateway` 已存在
- `ANYTHINGLLM_API_KEY` 已填
- `ANYTHINGLLM_BASE_URL` 指向可達的 AnythingLLM

---

## 4. 推薦啟動順序

### Step A：先跑檢查修復腳本

```powershell
.\check_and_fix_gateway.ps1 -NoStart
```

它會明確列出需求掃描（`OK` / `MISSING`）：
- `node` / `npm` / `npx`
- `scripts/bootstrap_gateway.ps1`
- `.env.gateway`
- `scripts/start_gateway.ps1`
- `gateway/web/approval_ui/index.html`

並在缺檔時可自動補齊（搭配 `-ForceBootstrap`）。

### Step B：正式啟動

```powershell
.\scripts\start_gateway.ps1
```

目前啟動腳本行為：

1. 載入 `.env.gateway`
2. 背景啟動 `npx tsx gateway/server.ts`
3. 等待 `GET /healthz` 就緒（預設 20 秒）
4. 嘗試開啟 `http://localhost:8787/approval-ui`
5. URL 開啟失敗時 fallback 到本機 `gateway/web/approval_ui/index.html`
6. 等待 gateway process 結束並回傳 exit code

不自動開 UI：

```powershell
.\scripts\start_gateway.ps1 -NoOpenUi
```

---

## 5. 健康檢查與核心端點

啟動後先檢查：

```powershell
Invoke-RestMethod http://localhost:8787/healthz
Invoke-RestMethod http://localhost:8787/lifecycle
Invoke-RestMethod http://localhost:8787/api/channels
```

重點端點：

- `GET /approval-ui`：Approval UI
- `POST /api/agent/command`：Web UI 發送命令
- `GET/POST /api/agent/control`：agent 狀態控制
- `GET/POST /api/channels`：通道啟用狀態
- `POST /ingress/telegram`：Telegram ingress
- `POST /ingress/line`：LINE ingress

---

## 6. Web 通道（最小可行驗證）

通常建議先測 web_ui，再測 Telegram/LINE：

1. `healthz` 為 ok
2. 開 `http://localhost:8787/approval-ui`
3. 呼叫 `POST /api/agent/command` 送一段文字

若收到 `web_ui channel is disabled`，請先檢查 `/api/channels` 狀態。

---

## 7. Telegram 串接（簡化流程）

1. 設定 `TELEGRAM_BOT_TOKEN`
2. 設定 webhook 到 `/ingress/telegram`
3. 若有 `TELEGRAM_WEBHOOK_SECRET`，確認 header 相符
4. 發送測試訊息並追 `trace_id`

如果 webhook 收不到，優先檢查 HTTPS + 公開網域 + 反向代理。

---

## 8. 常見失敗原因

1. `.env.gateway` 有填但未被載入
2. `ANYTHINGLLM_BASE_URL` 可寫但不可達
3. `ANYTHINGLLM_API_KEY` 值無效或權限不足
4. `npx tsx` 無法執行（registry / proxy / policy）
5. 通道被停用（`/api/channels`）

---

## 9. 除錯順序（最重要）

1. `healthz` 是否正常
2. env 是否載入
3. AnythingLLM API 是否可達
4. Proposal 是否成功
5. Policy 是否阻擋
6. Tool 是否執行失敗
7. 回覆是否在通道端丟失

---

## 10. 一句總結

Gateway 的關鍵價值是「把 AI 執行流程變成可治理系統」，
不是只讓模型「會呼叫工具」而已。
