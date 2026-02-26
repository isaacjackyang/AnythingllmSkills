# Approval UI（審批控制台）新手說明

這個資料夾提供最小可用的審批前端，用來處理「高風險操作要不要放行」。

## 它不是什麼

- 不是 AnythingLLM 主 UI
- 不是完整 CRM / 工單系統

## 它是什麼

- 顯示待審批提案（pending proposals）
- 提供 Approve / Reject
- 把決策回傳給 Gateway
- 提供 Agent 控制（Start / Pause / Resume / Stop）
- 提供簡化 Web command 通道入口

## 載入方式

Approval UI 有兩種打開方式：

1. **Gateway route（建議）**：`http://localhost:8787/approval-ui`
2. **本地檔案 fallback**：`gateway/web/approval_ui/index.html`

`start_gateway.ps1` 會優先嘗試 route，失敗才 fallback 到本地 HTML。

## 目前會呼叫的 API

`index.html` 主要使用 Gateway 控制/狀態 API：

- `GET /api/agent/control`
- `POST /api/agent/control`
- `GET /api/channels`
- `POST /api/channels`
- `GET /healthz`
- （發送操作指令時）`POST /api/agent/command`

## 新手測試步驟

1. 先在 repo 根目錄啟動 Gateway：
   ```powershell
   .\scripts\start_gateway.ps1
   ```
2. 等待啟動輸出顯示 health check 通過。
3. 打開 `http://localhost:8787/approval-ui`。
4. 測試 `Start / Pause / Resume / Stop`。
5. 若要驗證 web command，送一段指令並觀察後端 log 的 `trace_id`。

## 常見問題

### Q1：UI 打開了但按鈕沒反應？
先檢查 `GET /healthz`、`GET /api/agent/control` 是否成功，若 API 失敗 UI 不會正常更新。

### Q2：為何顯示通道未連線？
`connected` 是依近期活動計算，不代表永遠斷線；只要有活動就會變成 true。

### Q3：為何 Web command 會 503？
通常是 `web_ui` channel 被停用，請到 `/api/channels` 檢查並重新啟用。

一句話：Approval UI 是「人工守門 + 控制面板」，不是主要聊天前台。
