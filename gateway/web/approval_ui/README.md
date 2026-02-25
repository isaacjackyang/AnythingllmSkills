# Approval UI（審批控制台）新手說明

這個資料夾提供一個最小可用的審批前端，用來處理「高風險操作要不要放行」。

## 它不是什麼

- 它不是 AnythingLLM 主 UI。
- 它不是完整 CRM 或工單系統。

## 它是什麼

- 顯示待審批提案（pending proposals）
- 提供 Approve / Reject
- 把決策回傳給 Gateway
- 讓控制操作（Start/Pause/Resume/Stop）有可視化入口

## 目前行為

`index.html` 會呼叫 Gateway 控制 API：

- `GET /api/agent/control`
- `POST /api/agent/control`

也可透過 `/approval-ui` 路由直接載入。

## 新手測試步驟

1. 先啟動 Gateway。
2. 開瀏覽器進入 `/approval-ui`。
3. 嘗試按 `Start` / `Pause` / `Resume` / `Stop`。
4. 在後端 logs 確認狀態切換事件有記錄。

一句話：Approval UI 是「人工守門」的可視化面板。
