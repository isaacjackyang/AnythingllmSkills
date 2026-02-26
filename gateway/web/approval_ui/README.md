# Approval UI（Gateway 控制台）說明

> 這個 UI 是 Gateway 附帶的「控制面板 + 測試前台」，不是完整產品前端。

---

## 1) 這個 UI 實際用途

目前 `index.html` 主要負責：

- 顯示 Gateway 存活狀態（health/lifecycle）
- 管理 Agent 控制狀態（start/pause/resume/stop）
- 管理 channel enable/disable
- 發送 web command 到 `/api/agent/command`
- 呈現簡化的操作輸出區，方便快速驗證流程

你可以把它當「運維與驗證工具頁」。

---

## 2) 它不是什麼

- 不是 AnythingLLM 官方聊天 UI
- 不是完整工單/審核平台
- 不是多租戶管理後台

---

## 3) 載入方式

### A. 走 Gateway route（建議）

`http://localhost:8787/approval-ui`

優點：
- 與後端同源，少掉本地檔案跨域問題
- 最接近實際部署行為

### B. 本地檔案 fallback

`gateway/web/approval_ui/index.html`

在 `start_gateway.ps1` 中，若 URL 開啟失敗會嘗試 fallback。

---

## 4) UI 依賴 API（請確認 Gateway 有開）

- `GET /healthz`
- `GET /api/agent/control`
- `POST /api/agent/control`
- `GET /api/channels`
- `POST /api/channels`
- `POST /api/agent/command`

只要其中任何關鍵 API 失敗，UI 上部分功能就會失效或顯示異常。

---

## 5) 新手驗證流程（最穩）

1. 在 repo root 啟動 Gateway：
   ```powershell
   .\scripts\start_gateway.ps1
   ```
2. 先檢查：
   ```powershell
   Invoke-RestMethod http://localhost:8787/healthz
   ```
3. 開啟 `http://localhost:8787/approval-ui`。
4. 先做控制測試：`Start -> Pause -> Resume -> Stop`。
5. 再測 web command：送一段簡單文本，確認有 response/trace。

---

## 6) 常見問題

### Q1：頁面打得開，但按鈕沒反應？
先看 `healthz`、`/api/agent/control`、`/api/channels` 是否正常回 200。

### Q2：送 command 回 503？
通常是 `web_ui` channel 被停用，請在 channel 控制中重新 enable。

### Q3：為什麼顯示 disconnected？
channel 的 `connected` 依近期 activity 計算，不一定代表永久故障。

---

## 7) 給維運的建議

- 這個頁面適合 smoke test，不建議當最終商用前台。
- 若要客製化，優先保留 health/control/channel 三區塊，這是排障最關鍵資訊。

一句話：Approval UI 是 Gateway 的「操作儀表板」，不是主產品介面。
